"""Views, metrics and the auditor evidence pack (TRC-11 to TRC-16).

Everything here is read from the repository: decision records, the audit log, waivers, trace manifests. Nothing is
typed in by hand, and a metric with no data behind it is left out, not shown as zero (TRC-14).

The evidence pack supports an audit. It does not certify compliance with any law, regulation or standard.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import statistics
from pathlib import Path

import yaml

from . import __version__
from .checks_gov import _waiver_files, as_date, decisions, required_gates, today
from .checks_trace import build_manifest
from .core import GATES, KIT_DIR, METRIC_HOOKS, REGISTRY, VIEW_HOOKS, Context, KitError, Result, check, evidence_hash, front_matter, run_check
from .lanes import approved_records, complete, emergencies

STATEMENT = "This pack supports an audit. It does not certify compliance with any law, regulation or standard."
PACK_SCHEMA = "agentic-audit-pack/1"
PACK_FILE = "release/audit-pack.json"
_SECTION = re.compile(r"^##\s+(.+?)\s*$", re.M)
_FRONT = re.compile(r"\A---\s*\n.*?\n---\s*(?:\n|\Z)", re.S)


def sha(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


# ── the gate board ──────────────────────────────────────────────────────────────

def evidence_of(ctx: Context, spec: str, gate: str) -> list[str]:
    from .__main__ import _evidence_files
    return _evidence_files(ctx, spec, gate, None)


def current(ctx: Context, spec: str, gate: str, records: dict) -> bool:
    """Is the gate approved for the evidence as it stands now?"""
    found = records.get(gate)
    if not found:
        return False
    evidence = found[1].get("evidence") or {}
    try:
        return evidence_hash(ctx.src, spec, gate, [str(f) for f in evidence.get("files") or []]) == evidence.get("hash")
    except KitError:
        return False


def board(ctx: Context, only: list[str] | None = None) -> list[dict]:
    """Where every spec stands: one row per spec with the state of each gate it needs. With `only`, the rows of those specs."""
    rows = []
    for spec in ctx.specs() if only is None else only:
        records = approved_records(ctx, spec)
        gates, waiting = {}, False
        for gate in required_gates(ctx, spec):
            if current(ctx, spec, gate, records):
                gates[gate] = "approved"
            elif waiting:
                gates[gate] = "later"
            else:
                gates[gate] = "open" if evidence_of(ctx, spec, gate) else "no evidence yet"
                waiting = True
        rows.append({"spec": spec, "gates": gates, "complete": complete(ctx, spec)})
    return rows


def view_gates(ctx: Context) -> str:
    rows = board(ctx)
    gates = list(dict.fromkeys(g for row in rows for g in row["gates"])) or list(GATES[1:])
    lines = ["# Gate board", "", "`approved` means a recorded decision for the evidence as it stands now. `open` is the gate a person is needed at next.", "",
             "| Spec | " + " | ".join(gates) + " | Approvers of the open gate |", "|---|" + "---|" * (len(gates) + 1)]
    for row in rows:
        open_gate = next((g for g, s in row["gates"].items() if s in ("open", "no evidence yet")), None)
        who = ""
        if open_gate:
            from .checks_gov import gate_roles
            who = ", ".join(gate_roles(ctx, open_gate, row["spec"]))
        lines.append(f"| {row['spec']} | " + " | ".join(row["gates"].get(g, "not needed") for g in gates) + f" | {who or '-'} |")
    if not rows:
        lines.append("| (no spec yet) |" + " |" * (len(gates) + 1))
    return "\n".join(lines) + "\n"


# ── the waiver register ─────────────────────────────────────────────────────────

def view_waivers(ctx: Context) -> str:
    now = today(ctx)
    lines = ["# Waiver register", "", "Every recorded exception to a rule, with its owner and the day it ends.", "",
             "| Id | Rule | Covers | Owner | Expires | State |", "|---|---|---|---|---|---|"]
    n = 0
    for rel, body in sorted(_waiver_files(ctx)):
        if rel.endswith("/baseline.yml"):
            for g in body.get("groups") or []:
                exp = as_date(g.get("expires"))
                state = "expired" if exp is None or exp < now else "active"
                lines.append(f"| adoption baseline | {g.get('rule')} | {g.get('count')} existing finding(s) | {g.get('owner')} | {g.get('expires')} | {state} |")
                n += 1
            continue
        exp = as_date(body.get("expires"))
        state = "expired" if exp is None or exp < now else ("active, critical" if body.get("critical") else "active")
        scope = ", ".join(str(p) for p in (body.get("scope") or {}).get("paths") or []) or "-"
        lines.append(f"| {body.get('id')} | {body.get('rule')} | `{scope}` | {body.get('owner')} | {body.get('expires')} | {state} |")
        n += 1
    if not n:
        lines.append("| (none) | | | | | |")
    return "\n".join(lines) + "\n"


# ── the traceability matrix ─────────────────────────────────────────────────────

def view_trace(ctx: Context, only: str | None = None) -> str:
    lines = ["# Traceability matrix", "", "From each requirement to the criterion that tests it, the task that carried it and the tests that passed.", ""]
    for spec in [only] if only else ctx.specs():
        manifest = build_manifest(ctx, spec)
        lines += [f"## {spec}", "", "| Principle | Requirement | Criterion | Tasks | Tests | State |", "|---|---|---|---|---|---|"]
        for r in manifest["rows"]:
            lines.append(f"| {', '.join(r.get('principles') or []) or '-'} | {r['requirement']} | {r['criterion']} | {', '.join(r['tasks']) or '-'} | "
                         f"{len(r['tests'])} | {r['state']} |")
        if not manifest["rows"]:
            lines.append("| - | (no requirement with a criterion yet) | | | | |")
        lines += [f"- Not traced: {f}" for f in manifest["gate"]["failures"]] + [""]
    return "\n".join(lines).rstrip("\n") + "\n"


# ── metrics ─────────────────────────────────────────────────────────────────────

def audit_entries(ctx: Context) -> list[dict]:
    out = []
    for rel in ctx.src.files(f"{KIT_DIR}/audit"):
        if rel.endswith(".jsonl"):
            for line in ctx.src.read(rel).splitlines():
                try:
                    out.append(json.loads(line))
                except ValueError:
                    continue
    return out


def _hours(a: str, b: str) -> float | None:
    import datetime
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    try:
        return (datetime.datetime.strptime(b, fmt) - datetime.datetime.strptime(a, fmt)).total_seconds() / 3600
    except ValueError:
        return None


def decision_times(ctx: Context) -> dict[str, list[float]]:
    """gate -> hours between the gate being ready for a person and the decision being recorded, one value per spec."""
    ready: dict[tuple, str] = {}
    decided: dict[tuple, str] = {}
    for e in audit_entries(ctx):
        key = (str(e.get("spec")), str(e.get("gate")))
        at = str(e.get("at") or "")
        if e.get("action") in ("gate.ready", "gate.evidence"):
            ready[key] = min(ready.get(key, at), at)
        elif e.get("action") == "gate.decision":
            decided[key] = max(decided.get(key, at), at)
    out: dict[str, list[float]] = {}
    for key, start in ready.items():
        hours = _hours(start, decided[key]) if key in decided else None
        if hours is not None and hours >= 0:
            out.setdefault(key[1], []).append(hours)
    return out


def metrics(ctx: Context) -> list[dict]:
    """Rows of {metric, value, source}. A row exists only when there is data for it."""
    rows = []
    for gate, hours in sorted(decision_times(ctx).items()):
        rows.append({"metric": f"Time to decision at {gate} (median hours, {len(hours)} spec(s))", "value": round(statistics.median(hours), 1), "source": "audit log"})
    approvals = [a for _, rec in decisions(ctx) if rec.get("decision") in ("approve", "approve-with-conditions") for a in rec.get("approvals") or []]
    if approvals:
        rows.append({"metric": "Approvals recorded by people", "value": len(approvals), "source": "decision records"})
        rows.append({"metric": "People who approved", "value": len({str(a.get('reviewer')).lower() for a in approvals}), "source": "decision records"})
    specs = ctx.specs()
    if specs:
        rows.append({"metric": "Specs that have passed every gate they need", "value": f"{sum(complete(ctx, s) for s in specs)} of {len(specs)}", "source": "decision records"})
    for hook in METRIC_HOOKS:
        rows += [r for r in hook(ctx) if r.get("value") is not None]
    return rows


def view_metrics(ctx: Context) -> str:
    rows = metrics(ctx)
    lines = ["# Metrics", "", "Each figure is computed from the repository and names where it comes from. A measure with no data is not shown.", "",
             "| Measure | Value | Computed from |", "|---|---|---|"]
    lines += [f"| {r['metric']} | {r['value']} | {r['source']} |" for r in rows] or ["| (no data yet) | | |"]
    return "\n".join(lines) + "\n"


def view_changesets(ctx: Context) -> str:
    """One line for each change: its open gate, its tier and its pull requests (CHS-11)."""
    from . import changeset  # imported here: changeset imports this module
    return changeset.view(ctx)


def views() -> dict:
    """name -> (ctx) -> Markdown. The core's views, then those other extensions registered."""
    return {"gates": view_gates, "changesets": view_changesets, "waivers": view_waivers, "trace": view_trace, "metrics": view_metrics, **VIEW_HOOKS}


# ── one page a person can open without a terminal ───────────────────────────────

def _inline(text: str) -> str:
    out = html.escape(text)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)


def to_html(markdown: str) -> str:
    """Enough Markdown for the kit's own views: headings, tables, lists, code blocks and paragraphs."""
    out, lines, i = [], markdown.splitlines(), 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            out.append("<pre>" + html.escape("\n".join(block)) + "</pre>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            body = [r for r in rows[1:] if not all(re.fullmatch(r":?-+:?", c) for c in r)]
            out.append("<table><thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in rows[0]) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table>")
            continue
        elif line.startswith("#"):
            level = min(len(line) - len(line.lstrip("#")), 4)
            out.append(f"<h{level}>{_inline(line.lstrip('#').strip())}</h{level}>")
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{_inline(lines[i][2:])}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        elif line.strip():
            out.append(f"<p>{_inline(line)}</p>")
        i += 1
    return "\n".join(out)


def page(ctx: Context, rendered: dict[str, str]) -> str:
    style = ("body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a}"
             "table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ccc;padding:.35rem .6rem;text-align:left;vertical-align:top}"
             "th{background:#f3f3f3}code,pre{background:#f6f6f6;padding:.1rem .3rem;border-radius:3px}pre{padding:.8rem;overflow:auto}"
             "nav a{margin-right:1rem}section{border-top:2px solid #ddd;margin-top:2rem;padding-top:.5rem}")
    nav = "".join(f'<a href="#{name}">{html.escape(name)}</a>' for name in rendered)
    body = "".join(f'<section id="{name}">{to_html(text)}</section>' for name, text in rendered.items())
    return (f"<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>agentic-spec-kit report</title><style>{style}</style></head><body>"
            f"<h1>agentic-spec-kit report</h1><p>Generated on {today(ctx).isoformat()} from the repository. Nothing on this page was typed in by hand.</p>"
            f"<nav>{nav}</nav>{body}</body></html>\n")


def render_all(ctx: Context) -> dict[str, str]:
    out = {}
    for name, fn in views().items():
        try:
            out[name] = fn(ctx)
        except KitError as exc:
            out[name] = f"# {name}\n\nThis view could not be built: {exc}\n"
    return out


# ── the auditor evidence pack (TRC-16) ──────────────────────────────────────────

def _section_hashes(text: str) -> dict[str, str]:
    body = _FRONT.sub("", text, count=1)
    heads = list(_SECTION.finditer(body))
    return {m.group(1): sha(body[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)].strip().encode("utf-8")) for i, m in enumerate(heads)}


def specs_in_range(ctx: Context, start, end) -> list[str]:
    """Specs with a gate decision recorded between two dates, from the audit log."""
    found = set()
    for e in audit_entries(ctx):
        if e.get("action") == "gate.decision":
            day = as_date(str(e.get("at") or "")[:10])
            if day is not None and (start is None or day >= start) and (end is None or day <= end):
                found.add(str(e.get("spec")))
    return sorted(s for s in found if s in ctx.specs())


def build_pack(ctx: Context, specs: list[str], scope: dict | None = None) -> tuple[dict, dict[str, bytes]]:
    """The evidence pack for some specs: (manifest, {path inside the pack: content})."""
    from .checks_gov import active_waivers
    files: dict[str, bytes] = {}
    sources: dict[str, str] = {}

    def take(rel: str, name: str) -> None:
        if ctx.src.exists(rel):
            data = ctx.src.read_bytes(rel)
            files[name] = data
            sources[rel] = sha(data)

    approvals, exceptions, controls = [], [], []
    for spec in specs:
        for rel, rec in decisions(ctx):
            if str(rec.get("spec")) != spec:
                continue
            take(rel, f"decisions/{spec}/{rec.get('gate')}.yml")
            approvals.append({"spec": spec, "gate": rec.get("gate"), "decision": rec.get("decision"), "commit": rec.get("commit"),
                              "evidence_hash": (rec.get("evidence") or {}).get("hash"), "approvals": rec.get("approvals") or [],
                              "conditions": rec.get("conditions") or [], "lane": rec.get("lane", "standard")})
            if rec.get("single_approver_exception"):
                exceptions.append({"kind": "single approver", "spec": spec, "gate": rec.get("gate"), "detail": "one person held both the author and the approver role"})
            for f in (rec.get("evidence") or {}).get("files") or []:
                take(str(f), f"evidence/{f}")
        take(f"{KIT_DIR}/audit/{spec}.jsonl", f"audit/{spec}.jsonl")
        take(f"specs/{spec}/trace-manifest.json", f"trace/{spec}.json")
        take(f"specs/{spec}/spec.md", f"evidence/specs/{spec}/spec.md")
    for name, pack in ctx.packs():
        for control in pack.get("controls") or []:
            per_spec = {}
            for spec in specs:
                hashes = _section_hashes(ctx.src.read(f"specs/{spec}/spec.md")) if ctx.src.exists(f"specs/{spec}/spec.md") else {}
                digest = hashes.get(str(control.get("section")))
                per_spec[spec] = {"present": digest is not None, "sha256": digest, "where": f"specs/{spec}/spec.md, section '{control.get('section')}'"}
            controls.append({"pack": name, "reference": control.get("reference"), "section": control.get("section"), "asks": control.get("asks"), "specs": per_spec})
    try:
        waivers, groups = active_waivers(ctx)
    except KitError:
        waivers, groups = [], {}
    waiver_rows = [{"id": w.get("id"), "rule": w.get("rule"), "owner": w.get("owner"), "expires": str(w.get("expires")), "critical": bool(w.get("critical")),
                    "reason": w.get("reason"), "compensating_control": w.get("compensating_control")} for _, w in waivers]
    waiver_rows += [{"id": "adoption baseline", "rule": rule, "count": count} for rule, (count, _) in sorted(groups.items())]
    for rel, _ in waivers:
        take(rel, f"waivers/{rel.rsplit('/', 1)[-1]}")
    for _, e in emergencies(ctx):
        exceptions.append({"kind": "emergency change", "id": e.get("id"), "status": e.get("status"), "declared_by": e.get("declared_by"),
                           "retrospective_due": str((e.get("retrospective") or {}).get("due"))})
    for rel, name in ((f"{KIT_DIR}/roles.yml", "config/roles.yml"), (f"{KIT_DIR}/kit.yml", "config/kit.yml"), (".specify/memory/constitution.md", "config/constitution.md")):
        take(rel, name)
    results = {}
    for cid in sorted(REGISTRY):
        if cid == "CK-SELFTEST":
            continue
        r = run_check(cid, ctx)
        results[cid] = "not run" if r.not_run else ("fail" if r.findings else ("skipped" if any("skipped" in n for n in r.notes) else "pass"))
    chain = run_check("CK-AUDIT-CHAIN", ctx)
    kit = ctx.kit()
    manifest = {"schema": PACK_SCHEMA, "statement": STATEMENT, "generated_on": today(ctx).isoformat(),
                "kit": {"version": __version__, "upstream": (kit.get("upstream") or {}).get("speckit"), "profile": ctx.profile,
                        "domain_packs": [name for name, _ in ctx.packs()]},
                "scope": {"specs": specs, **(scope or {})}, "controls": controls, "approvals": approvals, "waivers": waiver_rows, "exceptions": exceptions,
                "checks": results, "audit_log": "intact" if chain.ok else "NOT INTACT: " + "; ".join(f.message for f in chain.findings[:3]),
                "sources": dict(sorted(sources.items())), "files": {name: sha(data) for name, data in sorted(files.items())}}
    from . import delivery
    manifest["delivery"] = {spec: delivery.ledger(ctx, spec) for spec in specs}  # as found on the day the pack is made (DLV-9)
    readme = [f"# Evidence pack: {', '.join(specs) or 'no spec in scope'}", "", f"**{STATEMENT}**", "",
              f"Generated on {manifest['generated_on']} by agentic-spec-kit {__version__}, profile {ctx.profile}.", "",
              "| Folder | Holds |", "|---|---|", "| `decisions/` | One record per gate decision: who approved, in which role, in which review, and the hash of what they reviewed |",
              "| `evidence/` | The files each decision was made on, as they are in the repository today |",
              "| `audit/` | The hash-chained audit log of each spec |", "| `trace/` | Requirement to test, per spec |",
              "| `waivers/` | Recorded exceptions that are active |", "| `config/` | Roles and who holds them, the kit settings, the constitution |", "",
              "`MANIFEST.json` lists every file here with its SHA-256, the control mapping of each active domain pack with the hash of the spec section that",
              "answers each control, every approval, waiver and exception, and the result of every check on the day the pack was made.", "",
              f"Audit log: {manifest['audit_log']}.", f"Checks: {sum(v == 'pass' for v in results.values())} passed, {sum(v == 'fail' for v in results.values())} failed, "
              f"{sum(v == 'not run' for v in results.values())} not run, {sum(v == 'skipped' for v in results.values())} not required by the profile."]
    readme += ["", "Under `delivery`, `MANIFEST.json` also holds the commits, branches and pull requests of each spec, as they were found on that day."]
    files["README.md"] = ("\n".join(readme) + "\n").encode("utf-8")
    manifest["files"]["README.md"] = sha(files["README.md"])
    return manifest, files


def write_pack(out: Path, manifest: dict, files: dict[str, bytes]) -> None:
    for name, data in files.items():
        path = out / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, default=str) + "\n", encoding="utf-8", newline="\n")


def spec_pack(manifest: dict) -> dict:
    """What a spec keeps of its pack: everything but the copies, so the release gate can bind it as evidence."""
    return {k: v for k, v in manifest.items() if k != "files"}


@check("CK-AUDIT-PACK", ("TRC-16",), "a release was approved with its evidence pack in front of the approver, and the pack still matches the repository",
       profiles=("regulated",))
def ck_audit_pack(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        found = approved_records(ctx, spec).get("G7")
        if not found:
            continue
        rel = f"specs/{spec}/{PACK_FILE}"
        if not ctx.src.exists(rel):
            res.fail(f"{spec} was released with no evidence pack; make one before the release gate with `audit-pack --spec {spec} --write`", found[0])
            continue
        try:
            pack = json.loads(ctx.src.read(rel))
        except ValueError:
            res.fail("the evidence pack is not valid JSON", rel)
            continue
        if pack.get("schema") != PACK_SCHEMA or pack.get("statement") != STATEMENT:
            res.fail("the evidence pack was not made by the kit, or lacks the statement that it does not certify compliance", rel)
        if rel not in [str(f) for f in (found[1].get("evidence") or {}).get("files") or []]:
            res.fail("the release decision does not list the evidence pack among what was reviewed", found[0])
        own = (f"specs/{spec}/", f"{KIT_DIR}/decisions/{spec}/")
        for src, digest in (pack.get("sources") or {}).items():
            if not str(src).startswith(own):
                continue  # roles, settings, waivers and the audit log go on changing after a release; the pack holds them as they were
            if not ctx.src.exists(src):
                res.fail(f"the pack records {src}, which no longer exists", rel)
            elif sha(ctx.src.read_bytes(src)) != digest:
                res.fail(f"{src} changed after the evidence pack was made", rel)
