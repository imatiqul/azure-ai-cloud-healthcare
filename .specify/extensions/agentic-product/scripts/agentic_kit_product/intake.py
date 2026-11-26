"""Intake records (INT-1 to INT-4, INT-7): one neutral record per incoming requirement, whatever tool it came from.

A record is a file in the repository. It carries where the requirement came from, a screened copy of its text and a
hash of that text. Platform adapters (the connect extension) write records; nothing here talks to a network.
"""
from __future__ import annotations

import datetime
import hashlib
import re
from pathlib import Path

import yaml

from agentic_kit.checks_gov import people_by_role
from agentic_kit.core import KIT_DIR, Context, KitError, Result, check

INTAKE = f"{KIT_DIR}/intake"
SCHEMA = "agentic-intake/1"
STATES = ("new", "triaged", "specified", "duplicate", "delivered", "rejected")
CLOSED = {"duplicate": "duplicate-of", "delivered": "already-delivered", "rejected": "rejected"}
PLATFORMS = ("ado", "jira", "clickup", "github", "document", "manual")
OWNER_ROLES = ["product-owner"]
KEPT = ("threads", "discussion")  # what a refreshed record keeps: the links a person gave, and the digest of its comments

#: Text that must not enter the repository (working rule W5). Each hit is replaced before a record is written.
SCREENS = {
    "national-id": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "record-number": re.compile(r"\b(?:MRN|medical record (?:number|no\.?))[:#\s]*\d{5,}\b", re.I),
    "credential": re.compile(r"\b(?:password|passwd|api[_-]?key|secret|(?:access[_-]?)?token)\b\s*[:=]\s*[^\s,;]{6,}", re.I),
    "bearer-token": re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*"),
    "card-number": re.compile(r"\b(?:\d[ -]?){12,18}\d\b"),
}


def _luhn(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d = d * 2 - 9 if d > 4 else d * 2
        total, alt = total + d, not alt
    return total % 10 == 0


def screens(ctx: Context | None = None) -> dict[str, re.Pattern]:
    out = dict(SCREENS)
    if ctx is not None:
        for name, pattern in (((ctx.kit().get("intake") or {}).get("screen")) or {}).items():
            try:
                out[str(name)] = re.compile(str(pattern))
            except re.error as exc:
                raise KitError(f"kit.yml intake.screen.{name} is not a valid pattern: {exc}") from exc
    return out


def screen(text: str, patterns: dict[str, re.Pattern] | None = None) -> tuple[str, dict[str, int]]:
    """Replace anything that looks like personal data or a credential. Returns the clean text and what was replaced."""
    hits: dict[str, int] = {}

    def swap(kind: str):
        def inner(m: re.Match) -> str:
            if kind == "card-number" and not _luhn(re.sub(r"\D", "", m.group(0))):
                return m.group(0)
            hits[kind] = hits.get(kind, 0) + 1
            return f"[removed: {kind}]"
        return inner
    for kind, pattern in (patterns or SCREENS).items():
        text = pattern.sub(swap(kind), text)
    return text, hits


def content_hash(title: str, body: str) -> str:
    norm = "\n".join(line.rstrip() for line in f"{title.strip()}\n\n{body.strip()}".splitlines())
    return "sha256:" + hashlib.sha256(norm.encode("utf-8")).hexdigest()


def record_id(platform: str, key: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", f"{platform}-{key}".lower()).strip("-")
    return slug[:80]


def path_of(rid: str) -> str:
    return f"{INTAKE}/{rid}.yml"


def records(ctx: Context) -> list[tuple[str, dict]]:
    out = []
    for rel in ctx.src.files(INTAKE):
        if rel.endswith(".yml"):
            data = ctx.src.yaml(rel)
            out.append((rel, data if isinstance(data, dict) else {}))
    return out


def make_record(platform: str, key: str, title: str, body: str, url: str = "", revision: str = "", fetched: str | None = None,
                patterns: dict[str, re.Pattern] | None = None, **meta) -> dict:
    """Build a record from what a source returned. The text is screened first; the hash is of the screened text."""
    title, t_hits = screen(" ".join(str(title).split()), patterns)
    body, b_hits = screen(str(body).replace("\r\n", "\n").strip(), patterns)
    removed = {k: t_hits.get(k, 0) + b_hits.get(k, 0) for k in sorted(set(t_hits) | set(b_hits))}
    rec = {"schema": SCHEMA, "id": record_id(platform, key),
           "source": {"platform": platform, "key": str(key), "url": url, "revision": str(revision),
                      "fetched": fetched or datetime.date.today().isoformat()},
           "title": title, "body": body, "hash": content_hash(title, body), "status": "new"}
    rec.update({k: v for k, v in meta.items() if v not in (None, "", [])})
    if removed:
        rec["screened"] = removed
    return rec


def write_record(root: Path, rec: dict) -> str:
    rel = path_of(rec["id"])
    path = Path(root) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(rec, sort_keys=False, allow_unicode=True), encoding="utf-8", newline="\n")
    return rel


def upsert(root: Path, rec: dict) -> tuple[str, str]:
    """Write a fetched record. Returns (path, 'new' | 'unchanged' | 'updated' | 'source-changed').

    A record nobody has triaged yet is refreshed in place. Once a person has acted on it, its text is never replaced:
    a change at the source is noted under `latest`, and CK-INTAKE-DRIFT asks a person to look.
    """
    rel = path_of(rec["id"])
    path = Path(root) / rel
    if not path.is_file():
        return write_record(root, rec), "new"
    old = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    current = (old.get("latest") or {}).get("hash") or old.get("hash")
    if current == rec["hash"]:
        return rel, "unchanged"
    if old.get("status", "new") == "new":
        for key in KEPT:  # not part of the item's text, so new text does not take them away (CNV-5)
            if key in old and key not in rec:
                rec[key] = old[key]
        write_record(root, rec)
        return rel, "updated"
    old["latest"] = {"hash": rec["hash"], "revision": rec["source"].get("revision", ""), "fetched": rec["source"].get("fetched", "")}
    write_record(root, old)
    return rel, "source-changed"


def owner_roles(ctx: Context) -> list[str]:
    return [str(r) for r in ((ctx.kit().get("intake") or {}).get("owner_roles") or OWNER_ROLES)]


def decided_by_problem(ctx: Context, who) -> str | None:
    """Why `who` ({reviewer, role}) may not decide a requirement's fate, or None."""
    if not isinstance(who, dict) or not who.get("reviewer") or not who.get("role"):
        return "names no person and role"
    allowed = owner_roles(ctx)
    if str(who["role"]) not in allowed:
        return f"is decided by role {who['role']}; it takes {' or '.join(allowed)}"
    if str(who["reviewer"]).lower() not in people_by_role(ctx.roles()).get(str(who["role"]), set()):
        return f"is decided by {who['reviewer']}, who does not hold the role {who['role']}"
    return None


@check("CK-INTAKE-RECORD", ("INT-1", "INT-2", "INT-3", "INT-4"), "every incoming requirement is a valid, screened record with a known source and a decided fate")
def ck_intake_record(ctx: Context, res: Result) -> None:
    patterns = screens(ctx)
    specs = set(ctx.specs())
    ids = {str(r.get("id")) for _, r in records(ctx)}
    for rel, rec in records(ctx):
        rid = str(rec.get("id", ""))
        if rec.get("schema") != SCHEMA:
            res.fail(f"schema must be {SCHEMA}", rel)
            continue
        if rel != path_of(rid):
            res.fail(f"record id {rid!r} does not match its file name", rel)
        source = rec.get("source") or {}
        if source.get("platform") not in PLATFORMS:
            res.fail(f"source.platform must be one of {', '.join(PLATFORMS)}", rel)
        if not source.get("key"):
            res.fail("source.key is missing: the record cannot be traced back to where it came from", rel)
        title, body = str(rec.get("title") or ""), str(rec.get("body") or "")
        if not title.strip():
            res.fail("the record has no title", rel)
        if rec.get("hash") != content_hash(title, body):
            res.fail("the text does not match its hash; a record's text is changed by fetching it again, not by hand", rel)
        for kind, n in screen(f"{title}\n{body}", patterns)[1].items():
            res.fail(f"the text contains {n} value(s) that look like a {kind}; remove them at the source and fetch again", rel)
        status = rec.get("status")
        if status not in STATES:
            res.fail(f"status must be one of {', '.join(STATES)}", rel)
            continue
        if status == "specified":
            spec = str(rec.get("spec", ""))
            if spec not in specs:
                res.fail(f"status is specified but spec {spec or '(none)'} does not exist", rel)
            else:
                origin = f"specs/{spec}/origin.yml"
                listed = [str(x) for x in ((ctx.src.yaml(origin) or {}).get("intake") or [])] if ctx.src.exists(origin) else []
                if rid not in listed:
                    res.fail(f"{origin} does not list this record, so the spec's approver never saw where it came from", rel)
        if status in CLOSED:
            d = rec.get("disposition") or {}
            if d.get("decision") != CLOSED[status]:
                res.fail(f"status {status} needs disposition.decision: {CLOSED[status]}", rel)
            if not str(d.get("reason") or "").strip():
                res.fail("the disposition gives no reason", rel)
            problem = decided_by_problem(ctx, d.get("decided_by"))
            if problem:
                res.fail(f"the disposition {problem}", rel)
            target = str(d.get("target") or "")
            if status != "rejected":
                if not target:
                    res.fail(f"a {status} record must name what it duplicates or what already delivers it (disposition.target)", rel)
                elif target.split("#")[0] not in specs | ids and not target.startswith("capability:"):
                    res.fail(f"disposition.target {target} is not a spec, an intake record or a capability requirement", rel)


@check("CK-INTAKE-DRIFT", ("INT-7",), "when a work item changes at its source after someone acted on it, a person decides what that means")
def ck_intake_drift(ctx: Context, res: Result) -> None:
    for rel, rec in records(ctx):
        latest = (rec.get("latest") or {}).get("hash")
        if not latest or latest == rec.get("hash") or rec.get("status") in ("new", "rejected"):
            continue
        ack = rec.get("acknowledged") or {}
        if ack.get("hash") != latest:
            res.fail(f"the source changed after this record was {rec.get('status')} (revision {(rec.get('latest') or {}).get('revision') or 'unknown'}); "
                     "record under `acknowledged` whether the spec is amended or the change is ignored", rel)
            continue
        if ack.get("action") not in ("amend", "ignore"):
            res.fail("acknowledged.action must be amend or ignore", rel)
        if not str(ack.get("reason") or "").strip():
            res.fail("acknowledged gives no reason", rel)
        problem = decided_by_problem(ctx, ack.get("decided_by"))
        if problem:
            res.fail(f"the acknowledgement {problem}", rel)
