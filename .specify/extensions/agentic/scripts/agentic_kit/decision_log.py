"""A decision log for each change (DEC-1 to DEC-17, docs/design/decision-log.md).

`specs/<spec>/decision-log.yml` holds the choices made inside one change that no other record holds: the question,
who asked it and, once a person has decided, the outcome, the reason, the owner and the day.

The kit cannot know who typed a command, so writing an entry approves nothing and decides nothing. The log is part
of the evidence of G5 instead: the person who approves the implementation approves the decisions it rests on, and
an entry added or changed after that changes the evidence hash, which opens G5 again.

Other parts of the kit read a log through `entries(ctx, spec)`. `load`, `validate` and `write` are the three helpers under it.
"""
from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path

import yaml

from . import core
from .checks_gov import IMPLEMENTATION_GATE, today
from .checks_trace import _FR
from .core import KIT_DIR, Context, KitError, Result, audit_append, check

LOG_NAME = "decision-log.yml"
SCHEMA = "agentic-decision-log/1"
STATES = ("proposed", "open", "decided", "superseded")
UNDECIDED = ("proposed", "open")
#: The fields of an entry, in the order the commands write them.
FIELDS = ("id", "title", "state", "outcome", "why", "owner", "decided_on", "proposed_by", "affects", "source", "superseded_by")
GATE = IMPLEMENTATION_GATE  # the gate whose evidence the log is part of
MARK = "NOT DECIDED"
SHOWN = 8  # the lines the brief keeps of a section that is not its own; given more, it cuts them and says "and n more"
STATEMENT = ("This is a record: writing it approves nothing. The kit cannot tell who ran this command. "
             f"The log is part of the evidence of {GATE}, and the person who approves {GATE} approves the decisions in it.")
HEADER = ("# Decisions made inside this change. `agentic.py decision` writes this file, and a person may edit it.\n"
          f"# It is part of the evidence of {GATE}: the person who approves {GATE} approves what is decided here.\n")
ID = re.compile(r"D-[0-9]{3,}")
_LOG = re.compile(r"specs/[^/]+/" + re.escape(LOG_NAME))
_TASK = re.compile(r"^\s*[-*]\s*\[[ xX]\]\s*(T[0-9]+)\b", re.M)
_DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
#: What each action of the command takes besides --spec and --json.
TAKES = {"add": {"title", "by", "affects", "source"}, "decide": {"id", "outcome", "owner", "why", "on", "affects", "source"},
         "supersede": {"id", "by"}, "list": set()}


def log_path(spec: str) -> str:
    return f"specs/{spec}/{LOG_NAME}"


def is_log(path: str) -> bool:
    """Is this repository path the decision log of a spec? The kit's own commands write that file."""
    return bool(_LOG.fullmatch(str(path)))


def one_line(text, limit: int = 0) -> str:
    """Text for one line of a view: each run of white space is one space, and it is cut to `limit` characters where one is given."""
    out = " ".join(str(text or "").split())
    return out if not limit or len(out) <= limit else out[:limit - 1].rstrip() + "…"


def _text(value) -> str | None:
    if isinstance(value, datetime.date):
        return value.isoformat()
    out = "" if value is None else str(value).strip()
    return out or None


def _day(value) -> datetime.date | None:
    """A day, from a YAML date or from text such as 2026-11-26. Anything else is no date."""
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, str) and _DAY.fullmatch(value.strip()):
        try:
            return datetime.date.fromisoformat(value.strip())
        except ValueError:
            return None
    return None


def _normal(entry: dict) -> dict:
    """An entry as `entries` gives it: every field of DEC-1, a date as text, `affects` as a list of text."""
    affects = entry.get("affects")
    affects = affects if isinstance(affects, list) else ([] if affects is None else [affects])
    out = {key: _text(entry.get(key)) for key in FIELDS if key != "affects"}
    out.update({key: out[key] or "" for key in ("id", "title", "state")})
    out["title"] = one_line(out["title"])
    out["affects"] = [text for text in (_text(a) for a in affects) if text]
    return {key: out[key] for key in FIELDS}


# ── reading ─────────────────────────────────────────────────────────────────────

def load(ctx: Context, spec: str) -> dict | None:
    """The spec's log as the file has it, or None where the spec has none. Raises where the file is not a log."""
    rel = log_path(spec)
    if not ctx.src.exists(rel):
        return None
    try:
        doc = ctx.src.yaml(rel)
    except KitError as exc:
        raise KitError(str(exc).splitlines()[0]) from exc
    if not isinstance(doc, dict) or doc.get("schema") != SCHEMA:
        raise KitError(f"{rel} is not a decision log: its schema must be {SCHEMA}")
    if not isinstance(doc.get("entries"), list):
        raise KitError(f"{rel} is not a decision log: `entries` must be a list")
    return doc


def entries(ctx: Context, spec: str) -> list[dict]:
    """The entries of a spec's decision log, for the rest of the kit to read (DEC-2).

    Each is a dict with every field of DEC-1: `id`, `title` and `state` as text ("" where the file has none), `affects`
    as a list, and the others as text or None. A date is text, as 2026-11-26. Where the spec has no log, or the file
    cannot be read as one, the list is empty: CK-DECISION-LOG is what says that a log is broken.
    """
    try:
        doc = load(ctx, spec)
    except KitError:
        return []
    return [_normal(e) for e in (doc or {}).get("entries") or [] if isinstance(e, dict)]


def touching(found: list[dict], refs) -> list[dict]:
    """Of these entries, the ones whose `affects` names one of `refs`: a task, a requirement or a criterion."""
    wanted = {str(r) for r in refs}
    return [e for e in found if wanted & set(e.get("affects") or [])]


def _people(ctx: Context) -> dict[str, str]:
    """The people roles.yml lists, by their id in lower case. Read as the other checks read it: from the base where there is one."""
    listed = [str(p.get("id") or "").strip() for p in ctx.roles().get("people") or [] if isinstance(p, dict)]
    return {pid.lower(): pid for pid in listed if pid}


def _requirements(ctx: Context, spec: str) -> set[str]:
    rel = f"specs/{spec}/spec.md"
    return set(_FR.findall(ctx.src.read(rel))) if ctx.src.exists(rel) else set()


def _tasks(ctx: Context, spec: str) -> set[str]:
    rel = f"specs/{spec}/tasks.md"
    return set(_TASK.findall(ctx.src.read(rel))) if ctx.src.exists(rel) else set()


def approval(ctx: Context, spec: str) -> tuple[str, dict] | None:
    """(path, record) of the decision that approves the spec's implementation gate, or None. A rejection is not an approval."""
    rel = f"{KIT_DIR}/decisions/{spec}/{GATE}.yml"
    record = ctx.src.yaml(rel) if ctx.src.exists(rel) else None
    if isinstance(record, dict) and record.get("decision") in ("approve", "approve-with-conditions"):
        return rel, record
    return None


def _unknown_refs(ctx: Context, spec: str, refs) -> list[str]:
    """What is wrong with the `FR-…` and `T…` references among these, as phrases. The other forms are not looked at (DEC-13)."""
    out, frs, tasks = [], None, None
    for ref in refs:
        ref = str(ref)
        if re.fullmatch(r"FR-[0-9]+", ref):
            frs = _requirements(ctx, spec) if frs is None else frs
            if ref not in frs:
                out.append(f"affects {ref}, and the spec has no such requirement")
        elif re.fullmatch(r"T[0-9]+", ref):
            tasks = _tasks(ctx, spec) if tasks is None else tasks
            if ref not in tasks:
                out.append(f"affects {ref}, and the task list has no such task")
    return out


# ── CK-DECISION-LOG ─────────────────────────────────────────────────────────────

def validate(ctx: Context, spec: str, known: dict | None = None) -> list[str]:
    """What is wrong with one spec's log, as CK-DECISION-LOG says it (DEC-10 to DEC-14); nothing where the log is in order.
    `known` keeps the roles file from one spec to the next."""
    known = {} if known is None else known
    rel = log_path(spec)
    try:
        doc = ctx.src.yaml(rel)
    except KitError as exc:
        said = str(exc).splitlines()[0]  # "<path> is not valid YAML: " and the parser's first line
        return ["the file" + said[len(rel):] if said.startswith(rel) else said]
    if not isinstance(doc, dict) or doc.get("schema") != SCHEMA:
        return [f"schema must be {SCHEMA}"]
    raw = doc.get("entries")
    if not isinstance(raw, list):
        return ["`entries` must be a list"]
    out: list[str] = []
    ids = [e.get("id") for e in raw if isinstance(e, dict) and isinstance(e.get("id"), str)]
    out += [f"{eid} is the id of {ids.count(eid)} entries" for eid in dict.fromkeys(ids) if ids.count(eid) > 1]
    still = []
    for n, e in enumerate(raw, 1):
        if not isinstance(e, dict):
            out.append(f"entry {n} is not a mapping")
            continue
        eid, state = e.get("id"), e.get("state")
        if not isinstance(eid, str) or not ID.fullmatch(eid):
            out.append(f"entry {n} has the id {eid!r}, which is not of the form D-001")
        label = eid if isinstance(eid, str) and eid.strip() else f"entry {n}"
        if not _text(e.get("title")):
            out.append(f"{label} has no title: the title is the question")
        if state not in STATES:
            out.append(f"{label} has the state {state!r}; a state is one of {', '.join(STATES)}")
        if state == "decided":
            if not _text(e.get("outcome")):
                out.append(f"{label} is decided and has no outcome")
            if _day(e.get("decided_on")) is None:
                out.append(f"{label} is decided and has no date (decided_on, as 2026-11-26)")
            owner = _text(e.get("owner"))
            if not owner:
                out.append(f"{label} is decided and names no owner")
            else:
                if "people" not in known:
                    known["people"] = _people(ctx)
                if owner.lower() not in known["people"]:
                    out.append(f"{label} is decided by {owner}, whom roles.yml does not list as a person")
        elif state in UNDECIDED:
            still.append((label, state))
            if _text(e.get("outcome")):
                out.append(f"{label} is {state} and carries an outcome: an outcome is recorded when a person decides, with the owner and the day")
        elif state == "superseded":
            other = e.get("superseded_by")
            if not isinstance(other, str) or other == eid or other not in ids:
                out.append(f"{label} is superseded and names no other entry of this log (superseded_by: {other!r})")
        affects = e.get("affects")
        if affects is not None and not isinstance(affects, list):
            out.append(f"{label}: `affects` must be a list")
        else:
            out += [f"{label} {phrase}" for phrase in _unknown_refs(ctx, spec, affects or [])]
    record = approval(ctx, spec)
    if record:  # the person at the gate approves the decisions the implementation rests on: all of them, and decided (DEC-14)
        out += [f"{label} is still {state}, and {GATE} of {spec} is approved: decide it or supersede it, and {GATE} has to be decided again "
                "for the log as it then stands" for label, state in still]
        evidence = record[1].get("evidence")
        if rel not in [str(f) for f in (evidence.get("files") if isinstance(evidence, dict) else None) or []]:
            out.append(f"{GATE} of {spec} was approved without this log in its evidence ({record[0]}): nobody at the gate was shown these "
                       f"decisions, and {GATE} has to be decided again")
    return out


@check("CK-DECISION-LOG", ("GOV-5", "TRC-18"),
       "a change's decision log is well formed, each decision names an owner in roles.yml, and no entry is undecided or unseen once G5 is approved")
def ck_decision_log(ctx: Context, res: Result) -> None:
    known: dict = {}
    for spec in ctx.specs():
        rel = log_path(spec)
        if ctx.src.exists(rel):  # a spec with no log passes
            for message in validate(ctx, spec, known):
                res.fail(message, rel)


# ── writing ─────────────────────────────────────────────────────────────────────

def render(doc: dict) -> str:
    """The text of a log: the two lines that say what the file is, then each entry with its fields in one order and none of them empty."""
    rows = []
    for e in doc.get("entries") or []:
        if isinstance(e, dict):
            keys = [k for k in FIELDS if k in e] + [k for k in e if k not in FIELDS]
            e = {k: e[k] for k in keys if e[k] not in (None, "", [])}
        rows.append(e)
    body = {"schema": SCHEMA, **{k: v for k, v in doc.items() if k not in ("schema", "entries")}, "entries": rows}
    return HEADER + yaml.safe_dump(body, sort_keys=False, allow_unicode=True, width=110)


def write(ctx: Context, spec: str, doc: dict) -> str:
    """Write a spec's log into the working copy, and give its path. Nothing is judged here: `validate` and the check do that."""
    rel = log_path(spec)
    path = ctx.src.root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(doc), encoding="utf-8", newline="\n")
    return rel


def _need_spec(ctx: Context, spec: str) -> None:
    if not ctx.src.exists(f"specs/{spec}/spec.md"):
        raise KitError(f"spec {spec} does not exist")


def _open(ctx: Context, spec: str) -> dict:
    _need_spec(ctx, spec)
    return load(ctx, spec) or {"schema": SCHEMA, "entries": []}


def _next_id(doc: dict) -> str:
    used = [int(e["id"][2:]) for e in doc["entries"] if isinstance(e, dict) and isinstance(e.get("id"), str) and ID.fullmatch(e["id"])]
    return f"D-{max(used, default=0) + 1:03d}"


def _find(ctx: Context, spec: str, doc: dict | None, entry_id) -> dict:
    wanted = str(entry_id or "").strip().upper()
    found = [e for e in (doc or {}).get("entries") or [] if isinstance(e, dict) and str(e.get("id")) == wanted]
    if doc is None:
        raise KitError(f"{spec} has no decision log ({log_path(spec)})")
    if not found:
        raise KitError(f"{log_path(spec)} holds no entry {wanted or '(none named)'}")
    if len(found) > 1:
        raise KitError(f"{wanted} is the id of {len(found)} entries in {log_path(spec)}; mend the log first")
    return found[0]


def _more(entry: dict, refs: list[str]) -> bool:
    """Add what is not yet among the things an entry affects. Says whether anything was added."""
    have = entry.get("affects") if isinstance(entry.get("affects"), list) else []
    new = [r for r in dict.fromkeys(refs) if r not in [str(h) for h in have]]
    if new:
        entry["affects"] = list(have) + new
    return bool(new)


def _refs(ctx: Context, spec: str, affects) -> list[str]:
    refs = [text for text in (str(a).strip() for a in affects or []) if text]
    wrong = _unknown_refs(ctx, spec, refs)
    if wrong:
        raise KitError(f"the entry {wrong[0]}")
    return list(dict.fromkeys(refs))


def _written(ctx: Context, spec: str, doc: dict, action: str, entry: dict, actor: dict | None, **fields) -> dict:
    write(ctx, spec, doc)
    audit_append(ctx.src.root, spec, actor or {"type": "kit", "id": "decision"}, f"decision-log.{action}", spec=spec,
                 entry=entry.get("id"), state=entry.get("state"), outputs=[log_path(spec)], **fields)
    return _normal(entry)


def add(ctx: Context, spec: str, title: str, by: str = "", affects=(), source: str = "", actor: dict | None = None) -> dict:
    """Add a question to a spec's log (DEC-3). A person's is `open`; one by anybody else is a proposal. It never has an outcome."""
    doc = _open(ctx, spec)
    title, by = one_line(title), str(by or "").strip()
    if not title:
        raise KitError("an entry needs a title: the question, after --title")
    people = _people(ctx) if by else {}
    entry = {"id": _next_id(doc), "title": title, "state": "proposed" if by and by.lower() not in people else "open"}
    if by:
        entry["proposed_by"] = people.get(by.lower(), by)
    refs = _refs(ctx, spec, affects)
    if refs:
        entry["affects"] = refs
    if str(source or "").strip():
        entry["source"] = str(source).strip()
    doc["entries"].append(entry)
    return _written(ctx, spec, doc, "add", entry, actor, **({"by": entry["proposed_by"]} if by else {}))


def propose(ctx: Context, spec: str, questions, by: str, affects=(), actor: dict | None = None) -> list[dict]:
    """Put an agent's questions into a spec's log as proposals, each of them once (DEC-18). Gives the entries they now are.

    A question the log already holds in the same words is not added again. While that entry is not decided, what the
    question affects is added to it. A decided or superseded entry is left as it is. Where nothing changes, nothing is written.
    """
    asked = list(dict.fromkeys(q for q in (one_line(q) for q in questions or []) if q))
    if not asked:
        return []
    doc = _open(ctx, spec)
    refs = [text for text in (str(a).strip() for a in affects or []) if text]
    held, new, changed = [], [], False
    for question in asked:
        same = [e for e in doc["entries"] if isinstance(e, dict) and one_line(e.get("title")).casefold() == question.casefold()]
        if not same:
            entry = {"id": _next_id(doc), "title": question, "state": "proposed", "proposed_by": str(by), **({"affects": list(refs)} if refs else {})}
            doc["entries"].append(entry)
            new.append(entry)
            changed = True
        else:
            entry = same[0]
            if entry.get("state") in UNDECIDED and _more(entry, refs):
                changed = True
        held.append(entry)
    if changed:
        write(ctx, spec, doc)
    for entry in new:
        audit_append(ctx.src.root, spec, actor or {"type": "kit", "id": "decision"}, "decision-log.add", spec=spec, entry=entry["id"],
                     state="proposed", outputs=[log_path(spec)], by=str(by))
    return [_normal(e) for e in held]


def decide(ctx: Context, spec: str, entry_id: str, outcome: str, owner: str, why: str = "", on: str | None = None, affects=(),
           source: str = "", actor: dict | None = None) -> dict:
    """Record what a person decided (DEC-4). The kit cannot tell who is typing: the entry counts when G5 is approved with it."""
    _need_spec(ctx, spec)
    doc = load(ctx, spec)
    entry = _find(ctx, spec, doc, entry_id)
    if entry.get("state") not in UNDECIDED:
        raise KitError(f"{entry['id']} is {entry.get('state')}: an entry is decided once. To change a decision, add an entry and supersede this one")
    outcome, owner = str(outcome or "").strip(), str(owner or "").strip()
    if not outcome:
        raise KitError("decide needs --outcome: what was decided")
    if not owner:
        raise KitError("decide needs --owner: the person who decided, as roles.yml lists them")
    people = _people(ctx)
    if owner.lower() not in people:
        raise KitError(f"{owner} is not a person in roles.yml, and only a listed person owns a decision")
    day = _day(on) if on else today(ctx)
    if day is None:
        raise KitError("--on is a day, as 2026-11-26")
    refs = _refs(ctx, spec, affects)
    entry.update({"state": "decided", "outcome": outcome, "owner": people[owner.lower()], "decided_on": day})
    if str(why or "").strip():
        entry["why"] = str(why).strip()
    if str(source or "").strip():
        entry["source"] = str(source).strip()
    _more(entry, refs)
    return _written(ctx, spec, doc, "decide", entry, actor, owner=entry["owner"])


def supersede(ctx: Context, spec: str, entry_id: str, by: str, actor: dict | None = None) -> dict:
    """Mark an entry as replaced by another one of the same log (DEC-5). What it held stays."""
    _need_spec(ctx, spec)
    doc = load(ctx, spec)
    entry = _find(ctx, spec, doc, entry_id)
    if not str(by or "").strip():
        raise KitError("supersede needs --by: the id of the entry that replaces this one")
    other = _find(ctx, spec, doc, by)
    if other is entry:
        raise KitError(f"{entry['id']} cannot be superseded by itself")
    if entry.get("state") == "superseded":
        raise KitError(f"{entry['id']} is already superseded, by {entry.get('superseded_by')}")
    entry.update({"state": "superseded", "superseded_by": other["id"]})
    return _written(ctx, spec, doc, "supersede", entry, actor, by=other["id"])


# ── views ───────────────────────────────────────────────────────────────────────

def _order(found: list[dict]) -> list[dict]:
    """What is not decided first, then what is, then what was replaced. Within each, the order of the file."""
    rank = {"decided": 1, "superseded": 2}
    return sorted(found, key=lambda e: rank.get(e["state"], 0))


def standing(e: dict) -> str:
    """Where an entry that is not decided stands, and who asked: `open`, `open, asked by pat`, `proposed by backend-implementer`."""
    if e["state"] == "proposed" and e["proposed_by"]:
        return f"proposed by {e['proposed_by']}"
    return e["state"] + (f", asked by {e['proposed_by']}" if e["proposed_by"] else "")


def flat(e: dict, limit: int = 0) -> dict:
    """An entry for a view that gives it one line: no field holds a line break, and none is None. A log is text that anybody
    with the repository can write, so a view takes nothing from it that could start a line of its own."""
    return {**{key: one_line(e.get(key), limit) for key in FIELDS if key != "affects"}, "affects": [one_line(a) for a in e.get("affects") or []]}


def line(e: dict, full: bool = False) -> str:
    """One entry as one line of Markdown. `full` adds the reason, what it affects and its source, and cuts nothing short."""
    e = flat(e, 0 if full else 110)
    title, eid = e["title"] or "(no title)", f"`{e['id'] or '?'}`"
    if e["state"] == "decided":
        text = f"- {eid} decided by {e['owner'] or 'nobody named'} on {e['decided_on'] or 'no day given'}: {title} **Outcome:** {e['outcome']}"
        if full and e["why"]:
            text += f" **Why:** {e['why']}"
    elif e["state"] == "superseded":
        text = f"- {eid} superseded by {e['superseded_by'] or 'no entry named'}: {title}"
    elif e["state"] in UNDECIDED:
        text = f"- {eid} {MARK} ({standing(e)}): {title}"
    else:
        text = f"- {eid} {MARK} (the state {e['state']!r} is not one the kit knows): {title}"
    if full:
        text += (f" **Affects:** {', '.join(e['affects'])}" if e["affects"] else "") + (f" **Source:** {e['source']}" if e["source"] else "")
    return text


def _unreadable(ctx: Context, spec: str) -> str | None:
    """Why the spec's log cannot be shown, or None where it can or where there is none."""
    try:
        load(ctx, spec)
    except KitError as exc:
        return f"- {exc}. Nothing of it is shown here; the check CK-DECISION-LOG says what is wrong."
    return None


def brief_hook(ctx: Context, spec: str, gate: str) -> list[tuple[str, list[str]]]:
    """The reviewer brief of every gate: one line for each entry of the spec's log, what is not decided first (DEC-16)."""
    if not ctx.src.exists(log_path(spec)):
        return []
    broken = _unreadable(ctx, spec)
    if broken:
        return [("Decisions", [broken])]
    found = _order(entries(ctx, spec))
    lines = [line(e) for e in found] or ["- The log holds no entry."]
    if gate == GATE:
        lines.insert(0, f"- Approving {GATE} approves these decisions: `{log_path(spec)}` is part of its evidence. "
                        f"An entry marked {MARK} has to be decided first.")
    if len(lines) > SHOWN:
        shown = lines[:SHOWN - 1]
        rest = found[len(shown) - (1 if gate == GATE else 0):]
        waiting = sum(1 for e in rest if e["state"] not in ("decided", "superseded"))
        lines = shown + [f"- and {len(rest)} more in `{log_path(spec)}`" + (f", {waiting} of them not decided" if waiting else "")]
    return [("Decisions", lines)]


def changeset_hook(ctx: Context, spec: str) -> list[tuple[str, list[str]]]:
    """The page of a change: every entry of the spec's log, in full (DEC-17)."""
    if not ctx.src.exists(log_path(spec)):
        return []
    broken = _unreadable(ctx, spec)
    lines = [broken] if broken else [line(e, full=True) for e in _order(entries(ctx, spec))]
    return [("Decisions made in this change", lines or ["- The log holds no entry."])]


def table(spec: str, found: list[dict]) -> str:
    """What `decision list` prints."""
    def cell(value) -> str:
        return one_line(value).replace("|", "/")
    rows = [f"Decisions of {spec}, from {log_path(spec)}", "",
            "| Id | State | Question | Outcome | Owner | Decided on | Asked by | Affects |", "|---|---|---|---|---|---|---|---|"]
    for e in found:
        state = f"superseded by {e['superseded_by']}" if e["state"] == "superseded" and e["superseded_by"] else e["state"]
        rows.append(f"| {cell(e['id'])} | {cell(state)} | {cell(e['title'])} | {cell(e['outcome'])} | {cell(e['owner'])} | {cell(e['decided_on'])} | "
                    f"{cell(e['proposed_by'])} | {cell(', '.join(e['affects']))} |")
    counts = ", ".join(f"{sum(1 for e in found if e['state'] == s)} {s}" for s in STATES if any(e["state"] == s for e in found))
    waiting = [e["id"] for e in found if e["state"] not in ("decided", "superseded")]
    rows += ["", f"{len(found)} entr{'y' if len(found) == 1 else 'ies'}" + (f": {counts}." if counts else ".")
             + (f" Not decided: {', '.join(waiting)}." if waiting else "")]
    return "\n".join(rows)


# ── the command ─────────────────────────────────────────────────────────────────

def command(ctx: Context, args) -> int:
    """`agentic.py decision {add,decide,supersede,list} --spec <spec>` (DEC-3 to DEC-7). A refusal writes nothing and ends with 2."""
    action, spec = args.action, args.spec
    given = {name for name in set().union(*TAKES.values()) if getattr(args, name, None)}
    try:
        if "outcome" in given and action == "add":
            raise KitError("`add` takes no outcome. A person decides an entry, and `decide` records it: --id, --outcome and --owner")
        extra = sorted(given - TAKES[action])
        if extra:
            raise KitError(f"`{action}` does not take --{extra[0]}")
        if action == "list":
            _need_spec(ctx, spec)
            if load(ctx, spec) is None and not args.json:
                print(f"{spec} has no decision log ({log_path(spec)}).")
            else:
                found = entries(ctx, spec)
                print(json.dumps(found, indent=2) if args.json else table(spec, found))
            return 0
        if action == "add":
            entry = add(ctx, spec, args.title or "", by=args.by or "", affects=args.affects, source=args.source or "")
            said = f"{entry['id']} is {standing(entry)}: {entry['title']}"
            if entry["state"] == "proposed":
                said += f"\nA person decides it: decision decide --spec {spec} --id {entry['id']} --outcome \"...\" --owner <a person in roles.yml>"
        elif action == "decide":
            entry = decide(ctx, spec, args.id or "", args.outcome or "", args.owner or "", why=args.why or "", on=args.on,
                           affects=args.affects, source=args.source or "")
            said = f"{entry['id']} is recorded as decided by {entry['owner']} on {entry['decided_on']}: {one_line(entry['outcome'])}"
        else:
            entry = supersede(ctx, spec, args.id or "", args.by or "")
            said = f"{entry['id']} is superseded by {entry['superseded_by']}"
    except KitError as exc:
        print(str(exc) if action == "list" else f"{exc}\nNothing was written.", file=sys.stderr)
        return 2
    out = sys.stderr if args.json else sys.stdout  # with --json the entry alone goes to standard output
    if args.json:
        print(json.dumps(entry, indent=2))
    print(f"wrote {log_path(spec)}\n{said}\n{STATEMENT}", file=out)
    try:
        again = approval(ctx, spec) is not None
    except KitError:  # a record that cannot be read is CK-GATE-RECORD's to report; the entry is written either way
        again = False
    if again:
        print(f"{GATE} of {spec} is approved, and the log is part of its evidence: with this change {GATE} is open again.", file=out)
    return 0


# ── self-test material and registration ─────────────────────────────────────────

def sample_log() -> dict:
    """The log of the self-test's sample project: one decision that was replaced, and the one that replaced it."""
    return {"schema": SCHEMA, "entries": [
        {"id": "D-001", "title": "Are the spaces around a name part of the name?", "state": "superseded",
         "outcome": "Yes. A name is greeted exactly as it was typed.", "owner": "alice", "decided_on": datetime.date(2026, 11, 19),
         "affects": ["FR-001"], "superseded_by": "D-002"},
        {"id": "D-002", "title": "Are the spaces around a name part of the name? Asked again after the first test run.", "state": "decided",
         "outcome": "No. They are taken off before the greeting is made; the letters of the name stay as they were typed.",
         "why": "A copied name often ends in a space, and the greeting then showed two.", "owner": "alice",
         "decided_on": datetime.date(2026, 11, 20), "proposed_by": "backend-implementer", "affects": ["FR-001", "T001"],
         "source": "pull/1#review-1"}]}


def extend_sample(root: Path) -> None:
    from . import selftest
    selftest._write(root, log_path(selftest.SPEC), render(sample_log()))


def _late_proposal(root: Path) -> None:
    from . import selftest
    doc = sample_log()
    doc["entries"].append({"id": "D-003", "title": "Is a name of spaces only greeted at all?", "state": "proposed",
                           "proposed_by": "backend-implementer", "affects": ["T001"]})
    selftest._write(root, log_path(selftest.SPEC), render(doc))


def fixtures() -> dict:
    return {"CK-DECISION-LOG": ("an entry of the decision log is still proposed after the implementation gate was approved", _late_proposal, {}, {})}


def _register() -> None:
    from . import selftest
    core.BRIEF_HOOKS.append(brief_hook)
    core.CHANGESET_HOOKS.append(changeset_hook)
    core.SAMPLE_HOOKS.insert(0, extend_sample)  # first: what another extension builds from the sample's spec folder finds the log in it
    core.FIXTURE_HOOKS.append(fixtures)
    plan = selftest.GATE_PLAN[GATE][0]  # the sample's G5 is approved with the log in its evidence
    if LOG_NAME not in plan:
        plan.append(LOG_NAME)


_register()
