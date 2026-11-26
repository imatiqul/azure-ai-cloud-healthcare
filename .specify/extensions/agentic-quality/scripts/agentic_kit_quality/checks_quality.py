"""Security, privacy and test-depth packs (QLT-3 to QLT-11).

Each pack asks for a small file beside the spec and checks that it is complete and consistent with the
spec, the system map and, once a gate is approved, the evidence that gate bound. Nothing here runs a
scanner or a test: CI does, and the kit checks what CI recorded.
"""
from __future__ import annotations

import fnmatch
import re
import subprocess

from agentic_kit.checks_gov import spec_front
from agentic_kit.core import Context, Result, check

from agentic_kit_system.checks_change import DATA_EXT, DATA_GLOBS, EXTERNAL_TYPES, _empty, users_of
from agentic_kit_system.mapmodel import CONTRACT_TYPES, DATA_TYPES, restricted_classes

from .common import SYS, gate_record, load_map, need_sections, plan_specs, spec_ids, spec_tier, touched, touches

SCANS = ("secret", "dependency", "static")
PRIVACY = ["Purpose", "Minimum fields", "Lineage", "Retention", "Access paths", "Who can see what"]
#: Test kinds each tier must plan (QLT-7). kit.yml `test_strategy.tiers` replaces a row.
STRATEGY = {
    "low": ["unit"],
    "medium": ["unit", "integration"],
    "high": ["unit", "integration", "end-to-end"],
    "critical": ["unit", "integration", "end-to-end", "performance", "resilience"],
}
KINDS = ["unit", "integration", "contract", "migration", "end-to-end", "performance", "resilience", "accessibility"]
UI_TYPES = {"frontend", "shared-ui"}


# ── security (QLT-3, QLT-4, QLT-5) ──────────────────────────────────────────────

@check("CK-THREAT-MODEL", ("QLT-3", "QLT-4"), "each planned spec has a threat model whose threats link to a requirement and an abuse-case test", profiles=SYS)
def ck_threat_model(ctx: Context, res: Result) -> None:
    for spec in plan_specs(ctx):
        rel = f"specs/{spec}/threat-model.yml"
        if not ctx.src.exists(rel):
            res.fail("the spec has a plan but no threat model", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        if doc.get("schema") != "agentic-threats/1":
            res.fail("schema must be agentic-threats/1", rel)
        threats = doc.get("threats") or []
        if not threats:
            if not str(doc.get("none_because") or "").strip():
                res.fail("the threat model lists no threat and does not say why there is none (none_because)", rel)
            continue
        text = ctx.src.read(f"specs/{spec}/spec.md")
        frs, acs = spec_ids(ctx, spec, "FR"), spec_ids(ctx, spec, "AC")
        seen = set()
        for t in threats:
            tid = str(t.get("id") or "?")
            if tid in seen:
                res.fail(f"threat {tid} is listed twice", rel)
            seen.add(tid)
            if not str(t.get("threat") or "").strip():
                res.fail(f"threat {tid} does not say what the threat is", rel)
            if t.get("mitigation") not in frs:
                res.fail(f"threat {tid} is mitigated by {t.get('mitigation')!r}, which is not a requirement in the spec", rel)
            test = t.get("test")
            if test not in acs:
                res.fail(f"threat {tid} is tested by {test!r}, which is not an acceptance criterion in the spec", rel)
            elif not re.search(rf"{re.escape(str(test))}\b[^\n]*abuse case", text, re.I):
                res.fail(f"{test} tests threat {tid} but is not written as an abuse case in the spec", f"specs/{spec}/spec.md")


@check("CK-SECURITY-EVIDENCE", ("QLT-5",), "G5 was approved with secret, dependency and static scans, and an authorization matrix where an endpoint changed", profiles=SYS)
def ck_security_evidence(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    for spec in ctx.specs():
        found = gate_record(ctx, spec, "G5")
        if found is None:
            continue
        drel, rec = found
        bound = [str(f) for f in (rec.get("evidence") or {}).get("files") or []]
        rel = f"specs/{spec}/evidence/security.yml"
        if not ctx.src.exists(rel) or rel not in bound:
            res.fail("G5 was approved without security evidence (evidence/security.yml)", drel)
            continue
        doc = ctx.src.yaml(rel) or {}
        scans = doc.get("scans") or {}
        for kind in SCANS:
            s = scans.get(kind) or {}
            if not s:
                res.fail(f"there is no {kind} scan", rel)
            elif s.get("result") != "pass":
                res.fail(f"the {kind} scan did not pass (result: {s.get('result')})", rel)
            elif not s.get("tool") or not s.get("report") or not ctx.src.exists(str(s.get("report"))):
                res.fail(f"the {kind} scan names no tool or no report that exists", rel)
            elif str(s["report"]) not in bound:
                res.fail(f"the {kind} scan report was not part of the evidence approved at G5", drel)
        if touched(ctx, smap, spec, CONTRACT_TYPES) or spec_front(ctx, spec).get("endpoints_changed"):
            matrix = str(doc.get("authorization_matrix") or "")
            if not matrix or not ctx.src.exists(matrix):
                res.fail("an endpoint changed, so the evidence needs an authorization test matrix (role x tenant x resource)", rel)
                continue
            rows = (ctx.src.yaml(matrix) or {}).get("rows") or []
            for i, row in enumerate(rows, 1):
                if not all(row.get(k) for k in ("role", "tenant", "resource", "expect")):
                    res.fail(f"row {i} lacks a role, tenant, resource or expectation", matrix)
                elif row.get("result") != "pass":
                    res.fail(f"row {i} ({row['role']}, {row['tenant']} tenant, {row['resource']}) did not pass", matrix)
            if not any(r.get("tenant") == "other" and r.get("expect") == "deny" for r in rows):
                res.fail("the matrix never tests that another tenant's data is refused", matrix)
            if not any(r.get("expect") == "allow" for r in rows):
                res.fail("the matrix never tests an access that should be allowed", matrix)


# ── privacy (QLT-6) ─────────────────────────────────────────────────────────────

@check("CK-PRIVACY-IMPACT", ("QLT-6",), "a spec that touches protected data states purpose, minimum fields, lineage, retention and access", profiles=SYS)
def ck_privacy_impact(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    protected = restricted_classes(ctx)
    for spec in plan_specs(ctx):
        classified = [t for t in touches(ctx, spec) if (smap.nodes.get(t) or {}).get("classification") in protected]
        if not classified:
            continue
        rel = f"specs/{spec}/privacy-impact.md"
        if not ctx.src.exists(rel):
            res.fail(f"the spec touches protected data ({', '.join(classified)}) but has no privacy impact", rel)
            continue
        secs = need_sections(res, ctx, rel, PRIVACY)
        lineage = secs.get("Lineage", "")
        for node in classified:
            for user in users_of(smap, node, {"reads", "writes", "calls", "subscribes"}):
                if user not in lineage:
                    res.fail(f"'Lineage' does not name {user}, which the map says uses {node}", rel)


# ── test depth (QLT-7 to QLT-11) ────────────────────────────────────────────────

def mandatory_kinds(ctx: Context, smap, spec: str, tier: str) -> list[str]:
    table = {**STRATEGY, **(((ctx.kit().get("test_strategy") or {}).get("tiers")) or {})}
    kinds = list(table.get(tier) or [])
    if touched(ctx, smap, spec, CONTRACT_TYPES):
        kinds.append("contract")
    if touched(ctx, smap, spec, DATA_TYPES):
        kinds.append("migration")
    if touched(ctx, smap, spec, UI_TYPES):
        kinds.append("accessibility")
    return [k for k in KINDS if k in kinds]


def declared_dependencies(ctx: Context, smap, spec: str) -> set[str]:
    """External systems the spec itself says it relies on (`depends_on.nodes`)."""
    if smap is None:
        return set()
    nodes = (spec_front(ctx, spec).get("depends_on") or {}).get("nodes") or []
    return {str(n) for n in nodes if (smap.nodes.get(str(n)) or {}).get("type") in EXTERNAL_TYPES}


def external_dependencies(ctx: Context, smap, spec: str) -> list[str]:
    """External systems the change may rely on: those its touched nodes call, and those the spec lists under depends_on."""
    if smap is None:
        return []
    mine = set(touches(ctx, spec))
    called = {e["to"] for e in smap.edges if e.get("from") in mine and e.get("rel") == "calls"
              and (smap.nodes.get(e.get("to")) or {}).get("type") in EXTERNAL_TYPES}
    return sorted(called | declared_dependencies(ctx, smap, spec))


@check("CK-TEST-STRATEGY", ("QLT-7", "QLT-8"), "each spec plans the test kinds its tier requires, and shows them at G5", profiles=SYS)
def ck_test_strategy(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    minimum = int(((ctx.kit().get("test_strategy") or {}).get("mutation_threshold")) or 60)
    for spec in ctx.specs():
        if not ctx.src.exists(f"specs/{spec}/tasks.md"):
            continue
        rel = f"specs/{spec}/test-strategy.yml"
        if not ctx.src.exists(rel):
            res.fail("the spec has tasks but no test strategy", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        tier = spec_tier(ctx, smap, spec)
        if doc.get("tier") != tier:
            res.fail(f"the strategy is written for tier {doc.get('tier')}, but the spec is {tier}", rel)
        kinds = doc.get("kinds") or {}
        shown = gate_record(ctx, spec, "G5") is not None
        for kind in mandatory_kinds(ctx, smap, spec, tier):
            entry = kinds.get(kind)
            if not isinstance(entry, dict) or entry.get("not_applicable"):
                res.fail(f"a {tier}-tier spec that touches what this one touches needs {kind} tests; the strategy does not plan them", rel)
            elif shown and (not entry.get("evidence") or not ctx.src.exists(str(entry["evidence"]))):
                res.fail(f"G5 is approved but the {kind} tests have no evidence that exists", rel)
        if tier != "critical":
            continue
        mutation = doc.get("mutation") or {}
        if not isinstance(mutation.get("threshold"), (int, float)) or mutation["threshold"] < minimum:
            res.fail(f"a critical spec needs mutation testing on changed code with a threshold of at least {minimum}", rel)
        elif shown and (not isinstance(mutation.get("score"), (int, float)) or mutation["score"] < mutation["threshold"]
                        or not ctx.src.exists(str(mutation.get("report") or ""))):
            res.fail(f"G5 is approved but the mutation score ({mutation.get('score')}) is missing, below {mutation['threshold']}, or has no report", rel)
        covered = doc.get("negative_boundary") or {}
        for ac in sorted(spec_ids(ctx, spec, "AC")):
            if not covered.get(ac):
                res.fail(f"a critical spec needs negative and boundary tests for every acceptance criterion; {ac} has none", rel)
        declared = declared_dependencies(ctx, smap, spec)
        for dep in external_dependencies(ctx, smap, spec):
            entry = (doc.get("resilience") or {}).get(dep)
            # A touched service may call an external system the change has nothing to do with. Saying so, with a reason
            # a reviewer can read, is an answer; silence is not, and neither is a placeholder.
            if isinstance(entry, dict) and not _empty(str(entry.get("not_relied_on") or "")):
                if dep in declared:
                    res.fail(f"the strategy says the change does not rely on {dep}, but the spec lists it under depends_on; it needs a resilience test", rel)
            elif not entry or isinstance(entry, dict) or _empty(str(entry)):
                res.fail(f"a critical spec needs a resilience test for each external dependency it relies on; {dep} has none, "
                         "and no reason why the change does not rely on it (not_relied_on)", rel)


@check("CK-CHARACTERIZATION", ("QLT-9",), "code that already existed is pinned down by characterization tests before a spec changes it", profiles=SYS)
def ck_characterization(ctx: Context, res: Result) -> None:
    brownfield = (ctx.kit().get("adoption") or {}).get("mode") == "brownfield"
    for spec in plan_specs(ctx):
        front = spec_front(ctx, spec)
        flag = front.get("changes_existing_code")
        if flag is None:
            if brownfield:
                res.fail("this is an adopted codebase: the spec must say whether it changes existing code (changes_existing_code)", f"specs/{spec}/spec.md")
            continue
        if not flag:
            continue
        rel = f"specs/{spec}/evidence/characterization.yml"
        if not ctx.src.exists(rel):
            res.fail("the spec changes existing code but no characterization tests were recorded before the change", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        tests = [str(t) for t in doc.get("tests") or []]
        if not tests or any(not ctx.src.exists(t) for t in tests):
            res.fail("the characterization record names no tests, or tests that do not exist", rel)
        if doc.get("result") != "pass":
            res.fail(f"the characterization tests did not pass (result: {doc.get('result')})", rel)
        commit = str(doc.get("commit") or "")
        paths = [str(p) for p in front.get("paths") or []]
        if not commit:
            res.fail("the characterization record names no commit", rel)
        elif ctx.trusted.ref and paths:
            p = subprocess.run(["git", "-C", str(ctx.src.root), "diff", "--name-only", ctx.trusted.ref, commit], capture_output=True, text=True)
            if p.returncode:
                res.fail(f"commit {commit} of the characterization run is not in this repository", rel)
            for f in p.stdout.splitlines():
                if f and f not in tests and any(fnmatch.fnmatch(f, g) for g in paths):
                    res.fail(f"{f} had already changed when the characterization tests ran at {commit[:10]}", rel)
        else:
            res.notes.append(f"{spec}: could not confirm the tests ran before the code changed (no base ref)")


def data_files(ctx: Context) -> list[str]:
    cfg = ctx.kit().get("synthetic_data") or {}
    globs, allow = list(cfg.get("paths") or DATA_GLOBS), list(cfg.get("allow") or [])
    out = []
    for rel in ctx.src.files():
        if rel.startswith((".specify/", "specs/", ".git/")) or not rel.lower().endswith(DATA_EXT):
            continue
        if any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(rel.rsplit("/", 1)[-1], g) for g in globs) and not any(fnmatch.fnmatch(rel, g) for g in allow):
            out.append(rel)
    return out


@check("CK-TEST-DATA", ("QLT-10",), "seed and test data come from synthetic generators kept in the repository", profiles=SYS)
def ck_test_data(ctx: Context, res: Result) -> None:
    gens = [g for g in ((ctx.kit().get("synthetic_data") or {}).get("generators")) or [] if isinstance(g, dict)]
    for g in gens:
        if not g.get("path") or not ctx.src.exists(str(g["path"])):
            res.fail(f"synthetic-data generator {g.get('path')!r} does not exist", ".specify/agentic/kit.yml")
    outputs = [str(o) for g in gens for o in g.get("outputs") or []]
    files = data_files(ctx)
    for rel in files:
        if not any(fnmatch.fnmatch(rel, o) for o in outputs):
            res.fail("this data file is not the output of any synthetic generator named in kit.yml (synthetic_data.generators)", rel)
    res.notes.append(f"{len(files)} seed or test data file(s), {len(gens)} generator(s)")


@check("CK-A11Y", ("QLT-11",), "a frontend change was checked for accessibility to a stated level and for design-system conformance", profiles=SYS)
def ck_a11y(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    wanted = (ctx.kit().get("accessibility") or {}).get("level")
    for spec in ctx.specs():
        found = gate_record(ctx, spec, "G5")
        if found is None or not touched(ctx, smap, spec, UI_TYPES):
            continue
        drel, rec = found
        rel = f"specs/{spec}/evidence/accessibility.yml"
        if not ctx.src.exists(rel) or rel not in [str(f) for f in (rec.get("evidence") or {}).get("files") or []]:
            res.fail("G5 was approved for a frontend change without accessibility evidence (evidence/accessibility.yml)", drel)
            continue
        doc = ctx.src.yaml(rel) or {}
        if not doc.get("level"):
            res.fail("the accessibility check does not state the level it was held to", rel)
        elif wanted and doc["level"] != wanted:
            res.fail(f"checked to {doc['level']}, but kit.yml requires {wanted}", rel)
        for part, label in ((doc, "accessibility check"), (doc.get("design_system") or {}, "design-system conformance check")):
            if part.get("result") != "pass":
                res.fail(f"the {label} did not pass (result: {part.get('result')})", rel)
            elif not part.get("report") or not ctx.src.exists(str(part["report"])):
                res.fail(f"the {label} has no report that exists", rel)
