"""Feedback loops and debt (QLT-21, QLT-22, MAP-16, TRC-12)."""
from __future__ import annotations

import re

from agentic_kit.checks_gov import active_waivers, as_date, spec_front
from agentic_kit.core import GATES, KIT_DIR, Context, KitError, Result, check, front_matter, run_check

from agentic_kit_system.checks_change import _empty
from agentic_kit_system.mapmodel import tier_rank

from .common import SYS, approved_gates, load_map

INCIDENTS = f"{KIT_DIR}/incidents"
FINDINGS = f"{KIT_DIR}/findings.yml"
ADR_STATES = ("proposed", "accepted", "superseded", "rejected")


def adrs(ctx: Context) -> dict[str, tuple[str, dict]]:
    folder = str(((ctx.kit().get("adr") or {}).get("path")) or "docs/adr").rstrip("/")
    out = {}
    for rel in ctx.src.files(folder):
        if rel.endswith(".md"):
            front = front_matter(ctx.src.read(rel))
            if front.get("id"):
                out.setdefault(str(front["id"]), (rel, front))
    return out


@check("CK-ADR", ("QLT-21",), "decision records link to specs and map nodes, and a superseded record flags the specs that relied on it", profiles=SYS)
def ck_adr(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    records = adrs(ctx)
    specs = set(ctx.specs())
    for aid, (rel, front) in records.items():
        if not re.fullmatch(r"ADR-[0-9]+", aid):
            res.fail(f"decision record id {aid!r} is not of the form ADR-<number>", rel)
        if front.get("status") not in ADR_STATES:
            res.fail(f"{aid} status must be one of {', '.join(ADR_STATES)}", rel)
        if not front.get("specs") and not front.get("nodes"):
            res.fail(f"{aid} links to no spec and no system-map node", rel)
        for s in front.get("specs") or []:
            if str(s) not in specs:
                res.fail(f"{aid} links to spec {s}, which does not exist", rel)
        for n in front.get("nodes") or []:
            if smap is not None and str(n) not in smap.nodes:
                res.fail(f"{aid} links to node {n}, which is not in the system map", rel)
        if front.get("status") == "superseded" and str(front.get("superseded_by")) not in records:
            res.fail(f"{aid} is superseded but does not name the record that replaces it", rel)
    for spec in sorted(specs):
        cited = [str(a) for a in spec_front(ctx, spec).get("adrs") or []]
        for aid in cited:
            if aid not in records:
                res.fail(f"the spec relies on {aid}, which does not exist", f"specs/{spec}/spec.md")
            elif records[aid][1].get("status") == "superseded" and str(records[aid][1].get("superseded_by")) not in cited:
                res.fail(f"the spec relies on {aid}, which {records[aid][1].get('superseded_by')} has superseded; review the spec against the new decision",
                         f"specs/{spec}/spec.md")


def incidents(ctx: Context) -> list[tuple[str, dict]]:
    out = []
    for rel in ctx.src.files(INCIDENTS):
        if rel.endswith(".yml"):
            body = ctx.src.yaml(rel)
            out.append((rel, body if isinstance(body, dict) else {}))
    return out


@check("CK-INCIDENT-LOOP", ("QLT-22", "TRC-12"), "each postmortem names the spec, the gate that should have caught it, a finding and a proposed change", profiles=SYS)
def ck_incident_loop(ctx: Context, res: Result) -> None:
    findings = set()
    if ctx.src.exists(FINDINGS):
        findings = {str(f.get("id")) for f in (ctx.src.yaml(FINDINGS) or {}).get("findings") or []}
    specs = set(ctx.specs())
    for rel, inc in incidents(ctx):
        iid = inc.get("id") or rel.rsplit("/", 1)[-1][:-4]
        if inc.get("schema") != "agentic-incident/1":
            res.fail("schema must be agentic-incident/1", rel)
        if as_date(inc.get("date")) is None or _empty(str(inc.get("summary") or "")):
            res.fail(f"incident {iid} needs a date and a summary", rel)
        spec = inc.get("spec")
        if spec is None:
            if _empty(str(inc.get("no_spec_because") or "")):
                res.fail(f"incident {iid} names no spec and does not say why there was none (no_spec_because)", rel)
        elif str(spec) not in specs:
            res.fail(f"incident {iid} names spec {spec}, which does not exist", rel)
        if inc.get("escaped_gate") not in GATES:
            res.fail(f"incident {iid} does not name the gate that should have caught it (escaped_gate)", rel)
        if str(inc.get("finding")) not in findings:
            res.fail(f"incident {iid} is not linked to a finding in {FINDINGS}", rel)
        change = inc.get("proposed_change") or {}
        if change.get("kind") not in ("constitution", "check") or _empty(str(change.get("text") or "")):
            res.fail(f"incident {iid} proposes no change to the constitution or to a check", rel)


def escaped_defects(ctx: Context) -> dict:
    """TRC-12: escaped defects by the gate that should have caught them, from the incident loop."""
    by_gate: dict[str, int] = {}
    by_spec: dict[str, int] = {}
    rows = incidents(ctx)
    for _, inc in rows:
        by_gate[str(inc.get("escaped_gate"))] = by_gate.get(str(inc.get("escaped_gate")), 0) + 1
        if inc.get("spec"):
            by_spec[str(inc["spec"])] = by_spec.get(str(inc["spec"]), 0) + 1
    return {"total": len(rows), "by_gate": dict(sorted(by_gate.items())), "by_spec": dict(sorted(by_spec.items()))}


# ── MAP-16: the technical-debt register ─────────────────────────────────────────

def _weight(smap, nodes: list[str]) -> tuple[int, int]:
    """(highest tier rank, widest blast radius) over the nodes an item sits on."""
    if smap is None or not nodes:
        return -1, 0
    known = [n for n in nodes if n in smap.nodes]
    return (max((tier_rank(smap.nodes[n].get("tier")) for n in known), default=-1),
            max((len(smap.blast_radius([n])) for n in known), default=0))


def debt_register(ctx: Context) -> list[dict]:
    """Everything the kit knows is owed, ordered by tier and then by how far it reaches."""
    smap = load_map(ctx, required=False)
    items: list[dict] = []

    def add(source: str, what: str, nodes: list[str], where: str, owner: str = "", due: str = "") -> None:
        tier, reach = _weight(smap, nodes)
        items.append({"source": source, "what": what, "nodes": sorted(set(nodes)), "where": where, "owner": owner, "due": str(due or ""),
                      "tier": ["low", "medium", "high", "critical"][tier] if tier >= 0 else "unknown", "reach": reach})

    def nodes_for(paths: list[str]) -> list[str]:
        if smap is None:
            return []
        return [n for n in {smap.node_for(p.replace("*", "x")) for p in paths} if n]

    if ctx.src.exists(FINDINGS):
        for f in (ctx.src.yaml(FINDINGS) or {}).get("findings") or []:
            if f.get("status") in ("fixed", "closed"):
                continue
            evidence = [str(e).split(":")[0] for e in f.get("evidence") or []]
            add("finding", f"{f.get('id')}: {f.get('statement')}", [str(n) for n in f.get("nodes") or []] or nodes_for(evidence), FINDINGS)
    waivers, groups = active_waivers(ctx)
    for rel, w in waivers:
        add("waiver", f"{w.get('id')}: {w.get('rule')} — {w.get('reason')}", nodes_for([str(p) for p in (w.get("scope") or {}).get("paths") or []]),
            rel, str(w.get("owner") or ""), w.get("expires"))
    for rule, (count, rel) in sorted(groups.items()):
        add("baseline", f"{count} × {rule} carried from adoption", [], rel)
    for cid in ("CK-MAP-DRIFT", "CK-CONTRACT-DRIFT", "CK-DRIFT-SPEC", "CK-AMENDMENT"):
        try:
            result = run_check(cid, ctx)
        except KeyError:
            continue
        for f in result.findings:
            add("drift", f"{cid}: {f.message}", nodes_for([f.path.split(":")[0]]) if f.path else [], f.path)
    if smap is not None:
        for nid, n in smap.nodes.items():
            if n.get("origin") == "assumed":
                add("map", f"{nid} is in the map on assumption; nobody has confirmed it", [nid], "system-map/map.yml", str(n.get("owner") or ""))
    done = approved_gates(ctx)
    for spec in ctx.specs():
        rel = f"specs/{spec}/trace-manifest.json"
        if ctx.src.exists(rel):
            import json
            for row in (json.loads(ctx.src.read(rel)) or {}).get("rows") or []:
                if row.get("state") == "tracked-debt" and "G5" in done.get(spec, set()):
                    add("trace", f"{spec}: {row.get('criterion') or row.get('requirement')} was released without a passing test",
                        [str(n) for n in row.get("nodes") or []], rel)
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}
    return sorted(items, key=lambda i: (order[i["tier"]], -i["reach"], i["source"], i["what"]))


def render_debt(items: list[dict]) -> str:
    lines = ["# Technical-debt register", "",
             "Generated by the kit from findings, waivers, the adoption baseline, drift and unconfirmed map entries.",
             "Ordered by the tier of what each item sits on, then by how many other nodes that reaches.", "",
             "| Tier | Reach | Source | What | Where | Owner | Due |", "|---|---|---|---|---|---|---|"]
    lines += [f"| {i['tier']} | {i['reach']} | {i['source']} | {i['what'][:140].replace('|', '/')} | `{i['where']}` | {i['owner']} | {i['due']} |" for i in items]
    return "\n".join(lines) + ("\n" if items else "\n\nNothing is recorded as owed.\n")
