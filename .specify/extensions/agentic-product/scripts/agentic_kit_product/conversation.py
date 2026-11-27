"""The conversation behind a change (CNV-1 to CNV-14, docs/design/conversation.md).

Two things are kept, and no more. In a spec's origin.yml: a few lines that someone wrote about what was said, with
who wrote them and whether a person has confirmed them. On an intake record: the links a person gave to where the
talk is, and a count and a hash of the item's comments, so that a discussion that moves on after work began is
noticed. Nothing here talks to a network: the connect extension hands the comments over, and of a comment neither
the text nor the author is written anywhere.

Nothing here confirms a summary or acknowledges a discussion that moved. Both are a person's to do.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import yaml

from agentic_kit.checks_gov import as_date
from agentic_kit.core import Context, KitError, Result, check, evidence_hash
from agentic_kit.lanes import approved_records

from . import common, dedupe, intake, living

HEADING = "The conversation behind it"
DIGEST = "agentic-discussion/1"
NOT_ON_LINKS = ("card-number",)  # an address often holds a long number that is none (CNV-3)
CANNOT_TELL = ("The kit cannot tell who typed this command. origin.yml is part of the evidence of the first gate, "
               "so the review of that gate covers this line.")
REFUSED = ". Give the address in a form that holds no such value. Nothing was written."
_HASH = re.compile(r"sha256:[0-9a-f]{64}")


# ── text ────────────────────────────────────────────────────────────────────────

def plain(text: str) -> str:
    """Text with CRLF read as LF, no white space at the end of a line and no empty line at either end."""
    lines = [line.rstrip() for line in str(text).replace("\r\n", "\n").split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def one_line(value) -> str:
    """A value from a file, for one line of a page: it cannot start a line of its own."""
    return " ".join(str(value if value is not None else "").split())


class _Lines(yaml.SafeDumper):
    """Writes a text of several lines as a block of plain lines, so that a person can read it in a review."""


def _text(dumper, value):
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style="|" if "\n" in value else None)


_Lines.add_representer(str, _text)


def dump(data) -> str:
    return yaml.dump(data, Dumper=_Lines, sort_keys=False, allow_unicode=True)


def link_problem(url, patterns: dict) -> str | None:
    """Why an address may not be kept as a link, or None (CNV-3). The answer never repeats the address: it may hold the secret."""
    if not isinstance(url, str):
        return "is not an http or https address"
    try:
        parts = urlsplit(url)
        host, login = parts.hostname, parts.username or parts.password
    except ValueError:
        return "is not an http or https address"
    if parts.scheme not in ("http", "https") or not host or any(ch.isspace() for ch in url):
        return "is not an http or https address"
    if login:
        return "carries a user name or a password"
    hits = intake.screen(url, {kind: p for kind, p in patterns.items() if kind not in NOT_ON_LINKS})[1]
    if hits:
        return "holds what looks like a " + " and a ".join(sorted(hits))
    return None


def refused(links: list[str], patterns: dict, what: str = "link") -> list[str]:
    """One sentence for each address that may not be kept. It names the address by its place in the list, never by its text."""
    found = [(n, link_problem(url, patterns)) for n, url in enumerate(links, 1)]
    return [f"{what} {n} {problem}" for n, problem in found if problem]


# ── reading what is kept ────────────────────────────────────────────────────────

def block(ctx: Context, spec: str) -> dict | None:
    conv = dedupe.origin(ctx, spec).get("conversation")
    return conv if isinstance(conv, dict) else None


def _strings(value) -> list[str]:
    return [one_line(v) for v in value if isinstance(v, str) and v.strip()] if isinstance(value, list) else []


def threads_of(rec: dict) -> list[str]:
    return _strings(rec.get("threads"))


def linked(ctx: Context, spec: str) -> list[tuple[str, dict]]:
    """The intake records that the spec's origin.yml lists, and that exist."""
    by_id = {str(r.get("id")): r for _, r in intake.records(ctx)}
    return [(str(i), by_id[str(i)]) for i in dedupe.origin(ctx, spec).get("intake") or [] if str(i) in by_id]


def _digest_of(rec: dict) -> dict:
    return rec["discussion"] if isinstance(rec.get("discussion"), dict) else {}


def moved(rec: dict) -> dict | None:
    """What a later fetch found, when it is not what the first one found; else None."""
    d = _digest_of(rec)
    latest = d.get("latest") if isinstance(d.get("latest"), dict) else {}
    return latest if latest.get("hash") and latest.get("hash") != d.get("hash") else None


def people_listed(ctx: Context) -> set[str]:
    return {str(p.get("id")).lower() for p in ctx.roles().get("people") or [] if isinstance(p, dict) and p.get("id")}


def _first(ctx: Context, spec: str) -> str:
    try:
        return common.first_gate(ctx, spec)
    except (KitError, KeyError, IndexError):
        return "G1"


def _open(ctx: Context, spec: str) -> bool:
    try:
        return common.is_open(ctx, spec)
    except (KitError, KeyError, IndexError):
        return True


# ── the digest of a discussion (CNV-6 to CNV-9) ─────────────────────────────────

def digest(comments: list[dict], patterns: dict | None = None, fetched: str | None = None, complete: bool = True) -> dict:
    """The count and the hash of a discussion. `comments` are {id, author, body}; nothing of them is in what comes back.

    One line for each comment: a JSON list of its id, its author and the sha256 of its screened text. The lines are
    sorted, so the order a tracker returns them in does not matter."""
    lines = []
    for c in comments:
        text = intake.screen(plain(str(c.get("body") or "")), patterns)[0]
        cid, author = ("" if c.get(k) is None else str(c.get(k)) for k in ("id", "author"))
        lines.append(json.dumps([cid, author, hashlib.sha256(text.encode("utf-8")).hexdigest()], separators=(",", ":")))
    whole = "\n".join([DIGEST] + sorted(lines))
    out = {"comments": len(lines), "hash": "sha256:" + hashlib.sha256(whole.encode("utf-8")).hexdigest(),
           "fetched": fetched or datetime.date.today().isoformat()}
    if not complete:
        out["partial"] = True
    return out


def store_digest(root: Path, rid: str, found: dict, write: bool = True) -> str:
    """Put a digest on an intake record, the way `intake.upsert` treats the item's own text.

    Returns 'new' | 'unchanged' | 'updated' | 'moved'. A record nobody has acted on is brought up to date. Once
    someone has, the first digest stays and what was found is noted under `latest`; CK-CONVERSATION then asks a
    person to look. With `write` off nothing is written, and the answer is what a fetch would do."""
    path = Path(root) / intake.path_of(rid)
    if not path.is_file():
        return "new"  # a dry run, for an item that has no record yet
    rec = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    old = _digest_of(rec)
    if not old.get("hash"):
        rec["discussion"], state = dict(found), "new"
    else:
        latest = old.get("latest") if isinstance(old.get("latest"), dict) else {}
        if (latest.get("hash") or old.get("hash")) == found["hash"]:
            return "unchanged"
        if rec.get("status", "new") == "new":
            rec["discussion"], state = dict(found), "updated"
        else:
            old["latest"], state = dict(found), "moved"
    if write:
        intake.write_record(root, rec)
    return state


def add_threads(root: Path, rid: str, links: list[str]) -> list[str]:
    """Put thread links on an intake record. Its text, hash and status are not touched (CNV-5). Returns the links that were new."""
    path = Path(root) / intake.path_of(rid)
    rec = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    have = [str(t) for t in rec.get("threads") or []] if isinstance(rec.get("threads"), list) else []
    new = [u for u in dict.fromkeys(links) if u not in have]
    if new:
        rec["threads"] = have + new
        intake.write_record(root, rec)
    return new


# ── the check (CNV-10, CNV-11) ──────────────────────────────────────────────────

def _is_digest(d) -> bool:
    return (isinstance(d, dict) and isinstance(d.get("comments"), int) and not isinstance(d.get("comments"), bool)
            and d["comments"] >= 0 and bool(_HASH.fullmatch(str(d.get("hash") or ""))))


def _check_record(ctx: Context, res: Result, rel: str, rec: dict, patterns: dict) -> None:
    threads = rec.get("threads")
    if threads is not None and not isinstance(threads, list):
        res.fail("`threads` must be a list of addresses", rel)
    for n, url in enumerate(threads if isinstance(threads, list) else [], 1):
        problem = link_problem(url, patterns)
        if problem:
            res.fail(f"thread link {n} {problem}; take it out, and give it again with `intake add --thread` in a form that holds no such value", rel)
    d = rec.get("discussion")
    if d is None:
        return
    latest = d.get("latest") if isinstance(d, dict) else None
    if not _is_digest(d) or (latest is not None and not _is_digest(latest)):
        res.fail("`discussion` must hold `comments`, a number, and `hash`, a sha256, and so must `latest` under it; "
                 "`connect fetch` writes them, and nobody else does", rel)
        return
    if d.get("partial") or (latest or {}).get("partial"):
        res.notes.append(f"{rec.get('id')}: the discussion is longer than the kit reads, so a later comment may go unseen (`partial`)")
    new = moved(rec)
    if new is None or rec.get("status") in ("new", "rejected"):
        return
    ack = d.get("acknowledged") if isinstance(d.get("acknowledged"), dict) else {}
    if ack.get("hash") != new["hash"]:
        res.fail(f"the discussion moved after this record was {rec.get('status')}: {d['comments']} comment(s) when fetched on "
                 f"{d.get('fetched') or 'a day it does not give'}, {new['comments']} on {new.get('fetched') or 'a day it does not give'}. "
                 "Read the thread, then record under `discussion.acknowledged` whether the spec is amended or the change is ignored", rel)
        return
    if ack.get("action") not in ("amend", "ignore"):
        res.fail("discussion.acknowledged.action must be amend or ignore", rel)
    if not str(ack.get("reason") or "").strip():
        res.fail("discussion.acknowledged gives no reason", rel)
    problem = intake.decided_by_problem(ctx, ack.get("decided_by"))
    if problem:
        res.fail(f"the acknowledgement of the discussion {problem}", rel)


@check("CK-CONVERSATION", ("INT-2", "INT-7"),
       "a discussion that moved after someone acted on its record is looked at by a person, and what is kept of a conversation is screened and says who wrote it")
def ck_conversation(ctx: Context, res: Result) -> None:
    patterns = intake.screens(ctx)
    for rel, rec in intake.records(ctx):
        _check_record(ctx, res, rel, rec, patterns)
    listed: set[str] | None = None
    for spec in ctx.specs():
        rel = f"specs/{spec}/{dedupe.ORIGIN}"
        if not ctx.src.exists(rel) or "conversation" not in dedupe.origin(ctx, spec):
            continue
        conv = block(ctx, spec)
        if conv is None:
            res.fail("`conversation` must be a mapping; `product conversation` writes it", rel)
            continue
        if not isinstance(conv.get("summary"), str) or not conv["summary"].strip():
            res.fail("the conversation has no summary", rel)
        if not str(conv.get("captured_by") or "").strip():
            res.fail("the conversation does not say who wrote the summary (`captured_by`)", rel)
        if as_date(conv.get("captured_on")) is None:
            res.fail("the conversation does not say on which day the summary was written (`captured_on`)", rel)
        for name in ("links", "people"):
            held = conv.get(name)
            if held is not None and (not isinstance(held, list) or not all(isinstance(v, str) for v in held)):
                res.fail(f"`{name}` must be a list of texts", rel)
        kept = [str(conv.get("summary") or ""), str(conv.get("captured_by") or ""), *_strings(conv.get("people"))]
        for kind, n in intake.screen("\n".join(kept), patterns)[1].items():
            res.fail(f"the conversation holds {n} value(s) that look like a {kind}; write the summary again with `product conversation`, "
                     "which takes them out before anything is written", rel)
        links = conv.get("links") if isinstance(conv.get("links"), list) else []
        for n, url in enumerate(links, 1):
            problem = link_problem(url, patterns)
            if problem:
                res.fail(f"link {n} {problem}", rel)
        who = str(conv.get("confirmed_by") or "").strip()
        if who:
            listed = people_listed(ctx) if listed is None else listed
            if who.lower() not in listed:
                res.fail(f"`confirmed_by` names {one_line(who)}, who is not listed in roles.yml; a summary is confirmed by a person", rel)
        elif links and _open(ctx, spec):
            res.notes.append(f"{spec}: the conversation names {len(links)} link(s) and no person has confirmed its summary; "
                             f"the brief for {_first(ctx, spec)} says so")


# ── what a reviewer and a reader are shown (CNV-12, CNV-13) ─────────────────────

def _summary(conv: dict | None) -> list[str]:
    text = conv.get("summary") if conv else None
    return [line.strip() for line in text.splitlines() if line.strip()] if isinstance(text, str) else []


def _status(conv: dict) -> str:
    written = (f"Written by {one_line(conv.get('captured_by')) or 'someone the record does not name'} "
               f"on {one_line(conv.get('captured_on')) or 'a day it does not give'}.")
    confirmed = one_line(conv.get("confirmed_by"))
    if confirmed:
        return f"- **Confirmed by {confirmed}**, as origin.yml says; the kit cannot tell who wrote that line. {written}"
    if _strings(conv.get("links")):
        return f"- **No person has confirmed this summary.** {written} Read the thread before you rely on it."
    return f"- **No person has confirmed this summary, and no link says where the conversation was.** {written}"


def _some(items: list[str], limit: int) -> str:
    return ", ".join(items[:limit]) + (f" and {len(items) - limit} more" if len(items) > limit else "")


def brief_hook(ctx: Context, spec: str, gate: str) -> list[tuple[str, list[str]]]:
    """For the brief of a spec's first gate: the summary, and whether a person has confirmed it. At most seven lines."""
    if gate != _first(ctx, spec):
        return []
    conv = block(ctx, spec)
    text = _summary(conv)
    if text:
        shown = text if len(text) <= 4 else text[:3]
        lines = [_status(conv)] + [f"> {line}" for line in shown]
        if len(text) > len(shown):
            lines.append(f"> (and {len(text) - len(shown)} more line(s), in origin.yml)")
        links, names = _strings(conv.get("links")), _strings(conv.get("people"))
        if links:
            lines.append(f"- **Links:** {_some(links, 3)}")
        if names:
            lines.append(f"- **People:** {_some(names, 8)}")
        return [(HEADING, lines)]
    waiting = [f"`{rid}`" for rid, rec in linked(ctx, spec)
               if threads_of(rec) or _digest_of(rec).get("comments") or (moved(rec) or {}).get("comments")]
    if not waiting:
        return []
    return [(HEADING, [f"- No summary of the conversation is recorded. {_some(waiting, 3)} {'has' if len(waiting) == 1 else 'have'} "
                       "comments or a thread link, and nobody has written down for this change what was agreed there."])]


def record_lines(rid: str, rec: dict) -> list[str]:
    """What is kept on one intake record about its discussion: the thread links, the digest, and whether it moved."""
    source = rec.get("source") if isinstance(rec.get("source"), dict) else {}
    name = f"`{rid}`" + (f" ({one_line(source.get('platform'))} {one_line(source.get('key'))})" if source.get("key") else "")
    out = [f"- {name}: thread link {url}" for url in threads_of(rec)]
    d = _digest_of(rec)
    if not _is_digest(d):
        return out
    line = f"- {name}: {d['comments']} comment(s) when fetched on {one_line(d.get('fetched')) or 'a day it does not give'}"
    new = moved(rec)
    if new:
        line += f"; {one_line(new.get('comments'))} on {one_line(new.get('fetched')) or 'a day it does not give'}: the discussion moved"
        ack = d.get("acknowledged") if isinstance(d.get("acknowledged"), dict) else {}
        if ack.get("hash") == new.get("hash"):
            by = ack.get("decided_by") if isinstance(ack.get("decided_by"), dict) else {}
            line += (f", and {one_line(by.get('reviewer')) or 'nobody named'} ({one_line(by.get('role')) or 'no role'}) acknowledged it "
                     f"as {one_line(ack.get('action')) or 'nothing'}: {one_line(ack.get('reason')) or 'no reason given'}")
        else:
            line += ", and nobody has acknowledged it (CK-CONVERSATION)"
    if d.get("partial") or (new or {}).get("partial"):
        line += ". The discussion is longer than the kit reads"
    return out + [line]


def section(ctx: Context, spec: str) -> list[str]:
    """Everything that is kept about the conversation behind a spec, as lines of Markdown."""
    conv = block(ctx, spec)
    text = conv.get("summary") if conv else None
    if isinstance(text, str) and text.strip():
        lines = [_status(conv)] + [f"> {line.rstrip()}" if line.strip() else ">" for line in plain(text).split("\n")]
        links, names = _strings(conv.get("links")), _strings(conv.get("people"))
        if links:
            lines += ["- **Links:**"] + [f"  - {url}" for url in links]
        if names:
            lines.append(f"- **People:** {', '.join(names)}")
    else:
        lines = ["- No summary of the conversation is recorded for this change. That is not the same as no conversation."]
    for rid, rec in linked(ctx, spec):
        lines += record_lines(rid, rec)
    return lines


def changeset_hook(ctx: Context, spec: str) -> list[tuple[str, list[str]]]:
    """For a change's page: one section, also where nothing is recorded, so that a reader is not left to guess."""
    return [(HEADING, section(ctx, spec))]


# ── the command (CNV-1 to CNV-4) ────────────────────────────────────────────────

def _approved_with(ctx: Context, spec: str, rel: str) -> list[str]:
    """Gates that were approved with this file in their evidence, and whose evidence is still what was approved."""
    out = []
    for gate, (_, rec) in sorted(approved_records(ctx, spec).items()):
        evidence = rec.get("evidence") if isinstance(rec.get("evidence"), dict) else {}
        files = [str(f) for f in evidence.get("files") or []]
        try:
            if rel in files and evidence_hash(ctx.src, spec, gate, files) == evidence.get("hash"):
                out.append(gate)
        except KitError:
            pass
    return out


def command(ctx: Context, args) -> int:
    """`product conversation`: print, write or confirm what is recorded of the conversation behind a spec."""
    spec = args.spec
    rel = f"specs/{spec}/{dedupe.ORIGIN}"
    if not ctx.src.exists(f"specs/{spec}/spec.md"):
        print(f"spec {spec} does not exist", file=sys.stderr)
        return 2
    org, old = dedupe.origin(ctx, spec), block(ctx, spec)
    removed: dict[str, int] = {}
    if args.summary is None:
        if args.link or args.person or args.captured_by:
            print("--link, --person and --captured-by go with --summary: the block is written whole, so that a confirmation is "
                  "always of the text beside it", file=sys.stderr)
            return 2
        if not args.confirmed_by:
            if args.json:
                print(json.dumps({"spec": spec, "conversation": old, "lines": section(ctx, spec)}, indent=2, default=str))
            else:
                print("\n".join([f"# {HEADING}: {spec}", ""] + section(ctx, spec)))
            return 0
        if not _summary(old):
            print(f"{rel} holds no summary to confirm; write one with --summary first", file=sys.stderr)
            return 2
        new = dict(old)
    else:
        patterns = intake.screens(ctx)

        def clean(text: str) -> str:
            out, hits = intake.screen(text, patterns)
            for kind, n in hits.items():
                removed[kind] = removed.get(kind, 0) + n
            return out
        who = clean(one_line(args.captured_by))
        if not who:
            print("say who wrote the summary with --captured-by: a person's id, or an agent's", file=sys.stderr)
            return 2
        links = list(dict.fromkeys(str(u).strip() for u in args.link or []))
        problems = refused(links, patterns)
        if problems:
            print("; ".join(problems) + REFUSED, file=sys.stderr)
            return 2
        for _, rec in linked(ctx, spec):  # where a person said at intake that the request was talked about
            links += [u for u in threads_of(rec) if u not in links and not link_problem(u, patterns)]
        summary = plain(clean(plain(str(args.summary).replace("\r\n", "\n").replace("\r", "\n"))))
        if not summary:
            print("the summary is empty", file=sys.stderr)
            return 2
        names = list(dict.fromkeys(n for n in (clean(one_line(p)) for p in args.person or []) if n))
        day = str(ctx.options.get("today") or datetime.date.today().isoformat())
        new = {"summary": summary, "links": links, "people": names, "captured_on": day, "captured_by": who, "confirmed_by": ""}
    if args.confirmed_by:
        person = one_line(args.confirmed_by)
        if person.lower() not in people_listed(ctx):
            print(f"{person} is not listed in roles.yml. A summary is confirmed by a person the project lists. Nothing was written.", file=sys.stderr)
            return 2
        new["confirmed_by"] = person
    if living.sealed(ctx, spec):
        print(f"{spec} is sealed: its files do not change any more. Nothing was written.", file=sys.stderr)
        return 2
    org = org or {"schema": "agentic-origin/1", "intake": [], "dispositions": []}
    org["conversation"] = new
    reopened = _approved_with(ctx, spec, rel) if old != new else []
    if args.write and old != new:
        path = ctx.src.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(dump(org), encoding="utf-8", newline="\n")
    if args.json:
        print(json.dumps({"spec": spec, "path": rel, "written": bool(args.write and old != new), "conversation": new, "screened": dict(sorted(removed.items())),
                          "reopens": reopened}, indent=2, default=str))
        return 0
    print(dump({"conversation": new}).rstrip("\n"))
    if removed:
        print(f"removed before writing: {dict(sorted(removed.items()))}")
    if old == new:
        print(f"unchanged {rel}")
    else:
        print(f"wrote {rel}" if args.write else f"would write {rel}; add --write to record it")
    if args.confirmed_by:
        print(CANNOT_TELL)
    elif new.get("links"):
        print("No person has confirmed this summary. The brief for the first gate says so. Someone who was in the conversation "
              "confirms it with --confirmed-by.")
    if reopened:
        print(f"note: {', '.join(reopened)} of {spec} {'was' if len(reopened) == 1 else 'were'} approved with {rel} as it was. "
              f"This change {'opens' if args.write else 'would open'} {'it' if len(reopened) == 1 else 'them'} again.")
    return 0
