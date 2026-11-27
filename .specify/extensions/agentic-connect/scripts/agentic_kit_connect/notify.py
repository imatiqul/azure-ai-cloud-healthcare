"""Notifications (NTF-1 to NTF-6): tell the right people that something needs them, and nothing more.

An event is a fact the kit can see in the repository: a gate became ready, a decision was recorded, a check failed,
a date is close. A notification carries identifiers, a status and a link. It never carries the text of a spec, a
requirement or a piece of evidence, so nothing protected can reach a chat channel or an inbox through the kit.

A notification never changes a gate. A reply in Slack, a comment on a work item or an email is not an approval.
"""
from __future__ import annotations

import hashlib
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from pathlib import Path

from agentic_kit.checks_gov import active_waivers, as_date, decisions, gate_roles, required_gates, today
from agentic_kit.core import Context, KitError, evidence_hash
from agentic_kit.lanes import approved_records, complete, emergencies

from .transport import expect, redact, secret

EVENTS = {
    "gate-ready": "Gate {gate} of {spec} is ready for review by {roles}",
    "gate-approved": "Gate {gate} of {spec} was approved",
    "gate-rejected": "Gate {gate} of {spec} was sent back",
    "check-failed": "{count} check(s) {status}: {ids}",   # {status}: failed, could not run, or failed or could not run (LIV-6)
    "released": "{spec} passed its last gate",
    "intake-new": "{count} new requirement(s) arrived: {ids}",
    "duplicate-candidate": "{ids} may duplicate existing work and needs a decision",
    "source-changed": "{ids} changed at its source after work began",
    "deadline": "{ids} is due on {status}",
}
FIELDS = ("spec", "gate", "roles", "count", "ids", "status", "decision")
CHANNELS = ("slack", "teams", "email", "work-item")
ACTION = {"gate-ready", "duplicate-candidate", "source-changed", "deadline"}
PROBLEM = {"check-failed", "gate-rejected"}


@dataclass
class Event:
    type: str
    key: str
    spec: str = ""
    gate: str = ""
    facts: dict = field(default_factory=dict)   # identifiers and statuses only
    records: list[str] = field(default_factory=list)  # intake records this event is about, for notes on work items

    def fields(self) -> dict:
        f = self.facts
        return {"spec": self.spec, "gate": self.gate, "roles": ", ".join(f.get("roles") or []) or "nobody yet named",
                "count": f.get("count", len(f.get("ids") or [])), "ids": _named(f.get("ids") or []),
                "status": f.get("status") or ("failed" if self.type == "check-failed" else ""), "decision": f.get("decision", "")}


#: How many identifiers one event names. A notification is a headline.
NAMED = 12


def _named(ids: list) -> str:
    """The first identifiers, and how many more there are: a reader must not take twelve for all of them (LIV-6)."""
    shown = ", ".join(str(i) for i in ids[:NAMED]) or "-"
    return shown + (f" and {len(ids) - NAMED} more" if len(ids) > NAMED else "")


def _key(*parts) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def title(event: Event, templates: dict | None = None) -> str:
    template = str((templates or {}).get(event.type) or EVENTS[event.type])
    return template.format(**event.fields())


from agentic_kit.reports import board, evidence_of as _evidence  # noqa: E402  (the gate board is the core's; this module adds events to it)


def detect(ctx: Context, results: list | None = None, commit: str = "") -> list[Event]:
    """The events this run can see. With a base ref, changes since the base; without one, the current state only."""
    out: list[Event] = []
    base = Context(ctx.trusted, ctx.trusted, ctx.options) if ctx.trusted.ref is not None else None
    failed = [r.check for r in results or [] if r.findings]
    not_run = [r.check for r in results or [] if r.not_run]
    if failed or not_run:
        out.append(Event("check-failed", _key("check-failed", commit, *sorted(failed + not_run)),
                         facts={"ids": failed + [f"{c} (not run)" for c in not_run], "count": len(failed) + len(not_run),
                                "status": " or ".join(word for word, some in (("failed", failed), ("could not run", not_run)) if some)}))
    green = results is not None and not failed and not not_run
    for row in board(ctx):
        spec = row["spec"]
        for gate, state in row["gates"].items():
            if state == "open" and green:
                files = _evidence(ctx, spec, gate)
                out.append(Event("gate-ready", _key("gate-ready", spec, gate, evidence_hash(ctx.src, spec, gate, files)), spec, gate,
                                 {"roles": gate_roles(ctx, gate, spec)}))
        if base is not None and row["complete"] and not complete(base, spec):
            out.append(Event("released", _key("released", spec), spec))
    if base is not None:
        before = {(str(r.get("spec")), str(r.get("gate"))): (r.get("decision"), (r.get("evidence") or {}).get("hash")) for _, r in decisions(base)}
        for _, rec in decisions(ctx):
            spec, gate = str(rec.get("spec")), str(rec.get("gate"))
            now = (rec.get("decision"), (rec.get("evidence") or {}).get("hash"))
            if before.get((spec, gate)) != now and rec.get("decision"):
                kind = "gate-rejected" if rec.get("decision") == "reject" else "gate-approved"
                out.append(Event(kind, _key(kind, spec, gate, *now), spec, gate, {"decision": rec.get("decision")}))
    out += _intake_events(ctx, base)
    out += _deadlines(ctx)
    return out


def _intake_events(ctx: Context, base: Context | None) -> list[Event]:
    try:
        from agentic_kit_product import dedupe, intake
    except ImportError:
        return []
    out = []
    old = {str(r.get("id")): r for _, r in intake.records(base)} if base is not None else None
    fresh = []
    for _, rec in intake.records(ctx):
        rid = str(rec.get("id"))
        latest = (rec.get("latest") or {}).get("hash")
        if latest and latest != rec.get("hash") and (rec.get("acknowledged") or {}).get("hash") != latest:
            if old is None or ((old.get(rid) or {}).get("latest") or {}).get("hash") != latest:
                out.append(Event("source-changed", _key("source-changed", rid, latest), str(rec.get("spec", "")), facts={"ids": [rid]}, records=[rid]))
        if old is not None and rid not in old and rec.get("status") == "new":
            fresh.append(rec)
    if fresh:
        ids = sorted(str(r.get("id")) for r in fresh)
        out.append(Event("intake-new", _key("intake-new", *ids), facts={"ids": ids, "count": len(ids)}))
        for rec in fresh:
            rid = str(rec.get("id"))
            if dedupe.candidates(ctx, str(rec.get("title", "")), str(rec.get("body", "")), {rid}):
                out.append(Event("duplicate-candidate", _key("duplicate-candidate", rid, rec.get("hash")), facts={"ids": [rid]}, records=[rid]))
    return out


def _deadlines(ctx: Context) -> list[Event]:
    days = int(((config_notify(ctx)).get("deadline_days")) or 14)
    now = today(ctx)
    out = []

    def due(kind: str, ident: str, when, spec: str = "") -> None:
        date = as_date(when)
        if date is not None and (date - now).days <= days:
            out.append(Event("deadline", _key("deadline", kind, ident, date), spec, facts={"ids": [f"{kind} {ident}"], "status": date.isoformat()}))
    try:
        waivers, _ = active_waivers(ctx)
    except KitError:
        waivers = []
    for _, w in waivers:
        due("waiver", str(w.get("id")), w.get("expires"))
    for _, e in emergencies(ctx):
        if e.get("status") == "open":
            due("emergency retrospective", str(e.get("id")), (e.get("retrospective") or {}).get("due"), str((e.get("retrospective") or {}).get("spec", "")))
    try:
        from agentic_kit_product import common, outcomes
        for spec in common.merged(ctx):
            data = outcomes.outcomes(ctx, spec) or {}
            reviewed = set()
            rrel = f"specs/{spec}/{outcomes.REVIEW}"
            if ctx.src.exists(rrel):
                reviewed = {str(r.get("outcome")) for r in ((ctx.src.yaml(rrel) or {}).get("reviews") or []) if isinstance(r, dict)}
            for o in data.get("outcomes") or []:
                if str((o or {}).get("id")) not in reviewed:
                    due("outcome review", f"{spec}/{(o or {}).get('id')}", (o or {}).get("review_by"), spec)
    except (ImportError, KitError):
        pass
    return out


# ── configuration ───────────────────────────────────────────────────────────────

def config_notify(ctx: Context) -> dict:
    from . import config
    return (config(ctx) or {}).get("notify") or {}


def channels_for(event: Event, notify_cfg: dict) -> list[dict]:
    by_id = {str(c.get("id")): c for c in notify_cfg.get("channels") or [] if isinstance(c, dict)}
    wanted: list[str] = []
    for route in notify_cfg.get("routes") or []:
        kinds = [str(k) for k in route.get("events") or []]
        if event.type in kinds or "*" in kinds:
            wanted += [str(c) for c in route.get("channels") or [] if str(c) not in wanted]
    return [by_id[c] for c in wanted if c in by_id]


def link(event: Event, notify_cfg: dict, pr_url: str = "") -> str:
    if pr_url:
        return pr_url
    repo = str(((notify_cfg.get("links") or {}).get("repository")) or "").rstrip("/")
    if not repo:
        return ""
    branch = str((notify_cfg.get("links") or {}).get("branch") or "main")
    return f"{repo}/tree/{branch}/specs/{event.spec}" if event.spec else repo


# ── rendering: identifiers, status and a link ───────────────────────────────────

def _tone(event: Event) -> str:
    return "Problem" if event.type in PROBLEM else ("Needs a person" if event.type in ACTION else "For information")


def render_slack(event: Event, text: str, url: str) -> dict:
    line = f"*{_tone(event)}:* {text}" + (f"\n<{url}|Open>" if url else "")
    return {"text": f"{_tone(event)}: {text}",
            "blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": line}},
                       {"type": "context", "elements": [{"type": "mrkdwn", "text": f"agentic-spec-kit · {event.type} · {event.key}"}]}]}


def render_teams(event: Event, text: str, url: str) -> dict:
    card = {"$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard", "version": "1.4",
            "body": [{"type": "TextBlock", "text": _tone(event), "weight": "Bolder", "size": "Medium"},
                     {"type": "TextBlock", "text": text, "wrap": True},
                     {"type": "TextBlock", "text": f"agentic-spec-kit · {event.type} · {event.key}", "isSubtle": True, "size": "Small", "wrap": True}]}
    if url:
        card["actions"] = [{"type": "Action.OpenUrl", "title": "Open", "url": url}]
    return {"type": "message", "attachments": [{"contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": None, "content": card}]}


def render_email(event: Event, text: str, url: str, sender: str, to: list[str]) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"[agentic-spec-kit] {text}"[:200]
    msg["From"], msg["To"] = sender, ", ".join(to)
    msg.set_content(f"{_tone(event)}: {text}\n\n" + (f"Open: {url}\n\n" if url else "")
                    + "A reply to this message is not an approval. A gate is passed only by a pull-request review.\n"
                    + f"Reference: {event.type} {event.key}\n")
    return msg


def render_note(event: Event, text: str, url: str) -> str:
    return f"agentic-spec-kit: {text}" + (f"\n{url}" if url else "") + f"\n(ref agentic:{event.key})"


# ── delivery ────────────────────────────────────────────────────────────────────

def _ledger(path: Path | None) -> set[str]:
    if path is None or not Path(path).is_file():
        return set()
    return {line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()}


def _remember(path: Path | None, entry: str) -> None:
    if path is not None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with Path(path).open("a", encoding="utf-8", newline="\n") as fh:
            fh.write(entry + "\n")


def _send(ctx: Context, cfg: dict, channel: dict, event: Event, text: str, url: str, transport, env, smtp_factory) -> str:
    kind = channel.get("type")
    if kind in ("slack", "teams"):
        hook = secret(channel.get("webhook_env", ""), env)
        try:
            payload = render_slack(event, text, url) if kind == "slack" else render_teams(event, text, url)
            expect(transport.request("POST", hook, {"Content-Type": "application/json"}, payload), f"the {kind} webhook")
        except KitError as exc:
            raise KitError(redact(str(exc), [hook])) from None
        return "sent"
    if kind == "email":
        smtp = channel.get("smtp") or {}
        host, port = secret(smtp.get("host_env", ""), env), int(smtp.get("port", 587))
        to = [str(a) for a in channel.get("to") or []]
        if not to or not smtp.get("from"):
            raise KitError(f"channel {channel.get('id')} needs `to` and `smtp.from`")
        password = secret(smtp["password_env"], env) if smtp.get("password_env") else ""
        try:
            server = (smtp_factory or smtplib.SMTP)(host, port)
            try:
                if port != 25 and hasattr(server, "starttls"):
                    server.starttls()
                if smtp.get("user_env"):
                    server.login(secret(smtp["user_env"], env), password)
                server.send_message(render_email(event, text, url, str(smtp["from"]), to))
            finally:
                server.quit()
        except (smtplib.SMTPException, OSError) as exc:
            raise KitError(redact(f"the mail server refused the message: {exc}", [password, host])) from None
        return "sent"
    if kind == "work-item":
        return _note(ctx, cfg, event, text, url, transport, env)
    raise KitError(f"channel {channel.get('id')} has unknown type {kind!r}")


def _note(ctx: Context, cfg: dict, event: Event, text: str, url: str, transport, env) -> str:
    """Post a note on the work item(s) the event's spec or record came from."""
    from agentic_kit_product import dedupe, intake

    from .trackers import adapter_for
    ids = list(event.records)
    if event.spec:
        ids += [str(i) for i in dedupe.origin(ctx, event.spec).get("intake") or [] if str(i) not in ids]
    by_id = {str(r.get("id")): r for _, r in intake.records(ctx)}
    sources = {str(s.get("id")): s for s in cfg.get("sources") or [] if isinstance(s, dict)}
    done = []
    for rid in ids:
        rec = by_id.get(rid) or {}
        source = sources.get(str(rec.get("via", "")))
        if not source:
            done.append("skipped: no configured source")
            continue
        adapter = adapter_for(source, transport, env, ctx.src.root)
        try:
            done.append(adapter.note(str((rec.get("source") or {}).get("key")), render_note(event, text, url), f"agentic:{event.key}"))
        except KitError as exc:
            raise KitError(redact(str(exc), adapter.used)) from None
    if not done:
        return "skipped: no work item is linked"
    return ", ".join(f"{done.count(s)} {s}" for s in dict.fromkeys(done))


def deliver(ctx: Context, cfg: dict, events: list[Event], transport, env: dict | None = None, ledger: Path | None = None,
            smtp_factory=None, pr_url: str = "") -> list[dict]:
    """Send each event to the channels its route names. A failure is reported, never raised: a chat outage must not fail a build."""
    notify_cfg = cfg.get("notify") or {}
    sent_before = _ledger(ledger)
    rows = []
    for event in events:
        text = title(event, notify_cfg.get("templates"))
        url = link(event, notify_cfg, pr_url)
        for channel in channels_for(event, notify_cfg):
            entry = f"{event.key}|{channel.get('id')}"
            if entry in sent_before:
                rows.append({"event": event.type, "key": event.key, "channel": channel.get("id"), "status": "already sent"})
                continue
            try:
                status = _send(ctx, cfg, channel, event, text, url, transport, env, smtp_factory)
            except KitError as exc:
                status = f"failed: {exc}"
            if not status.startswith(("failed", "skipped")):
                _remember(ledger, entry)
                sent_before.add(entry)
            rows.append({"event": event.type, "key": event.key, "channel": channel.get("id"), "status": status, "text": text})
    return rows
