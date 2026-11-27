"""Traceability, audit, drift, metric and verifier-input checks for slice 0.1."""
from __future__ import annotations

import fnmatch
import json
import re
import xml.etree.ElementTree as ET

from .checks_gov import constitution_map, decisions, spec_front
from .core import ARTIFACT_HOOKS, READING_HOOKS, GENESIS, KIT_DIR, Context, KitError, Result, check, entry_hash, match_any

_FR = re.compile(r"^\s*[-*]\s*\*\*(FR-[0-9]{3,})\*\*", re.M)
_AC = re.compile(r"^\s*[-*]\s*\*\*(AC-[0-9]{3,})\*\*\s*\(verifies\s+(FR-[0-9]{3,})\)", re.M)
_TASK = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s*(T[0-9]{3,})\b(.*)$", re.M)
_CARRIES = re.compile(r"Carries:\s*([A-Z0-9,\s-]+)")
_ID = re.compile(r"(?:AC|FR)-[0-9]{3,}")
_TEST_AC = re.compile(r"AC[-_]?([0-9]{3,})")


def _test_results(ctx: Context, spec: str) -> dict[str, list[tuple[str, bool]]]:
    """AC id -> [(test name, passed)] from JUnit XML files in the spec's evidence folder."""
    globs = ((ctx.kit().get("trace") or {}).get("test_results")) or ["specs/{spec}/evidence/*.xml"]
    globs = [g.replace("{spec}", spec) for g in globs]
    out: dict[str, list[tuple[str, bool]]] = {}
    for rel in ctx.src.files():
        if not any(fnmatch.fnmatch(rel, g) for g in globs):
            continue
        try:
            root = ET.fromstring(ctx.src.read(rel))
        except ET.ParseError as exc:
            raise KitError(f"{rel} is not valid JUnit XML: {exc}") from exc
        for case in root.iter("testcase"):
            name = f"{case.get('classname', '')}.{case.get('name', '')}".strip(".")
            passed = not any(case.find(tag) is not None for tag in ("failure", "error", "skipped"))
            for num in set(_TEST_AC.findall(name)):
                out.setdefault(f"AC-{num}", []).append((name, passed))
    return out


def build_manifest(ctx: Context, spec: str) -> dict:
    """Build the trace manifest for one spec. Pure function of the repo contents."""
    base = f"specs/{spec}"
    text = ctx.src.read(f"{base}/spec.md")
    front = spec_front(ctx, spec)
    principles = [str(p) for p in front.get("principles") or []]
    frs = list(dict.fromkeys(_FR.findall(text)))
    acs = {ac: fr for ac, fr in _AC.findall(text)}
    failures: list[str] = []
    lite = ctx.profile == "lite"

    cmap = constitution_map(ctx)
    if cmap is not None:
        known = {str(p.get("id")) for p in cmap.get("principles") or []}
        for p in principles:
            if p not in known:
                failures.append(f"{p}: principle is not in the constitution map")
    if not lite and not principles:
        failures.append("spec names no principle")
    for ac, fr in acs.items():
        if fr not in frs:
            failures.append(f"{ac}: verifies {fr}, which is not a requirement in this spec")

    has_tasks = ctx.src.exists(f"{base}/tasks.md")
    carried: dict[str, list[tuple[str, bool]]] = {}
    if has_tasks:
        for done, tid, rest in _TASK.findall(ctx.src.read(f"{base}/tasks.md")):
            m = _CARRIES.search(rest)
            for ref in (_ID.findall(m.group(1)) if m else []):
                if ref not in acs and ref not in frs:
                    failures.append(f"{tid}: carries {ref}, which is not in the spec")
                carried.setdefault(ref, []).append((tid, done.lower() == "x"))
    for fr in frs:
        if not any(v == fr for v in acs.values()):
            if lite and (not has_tasks or fr in carried):
                continue
            failures.append(f"{fr}: no acceptance criterion" + (" and no task carries it" if lite else ""))

    tests = {} if lite else _test_results(ctx, spec)
    for ac in tests:
        if ac not in acs:
            failures.append(f"{ac}: a test names it but the spec has no such criterion")
    waived = set()
    for rel in ctx.src.files(f"{KIT_DIR}/waivers"):
        if rel.endswith(".yml") and not rel.endswith("/baseline.yml"):
            rule = str((ctx.src.yaml(rel) or {}).get("rule", ""))
            if rule.startswith(f"ac:{spec}:"):
                waived.add(rule.split(":")[-1])

    rows = []
    for ac, fr in sorted(acs.items()):
        tasks = carried.get(ac, [])
        results = tests.get(ac, [])
        if not has_tasks:
            state = "planned"
        elif lite:
            state = "tracked-debt" if tasks else "gap"
        elif results and all(ok for _, ok in results):
            state = "proven"
        elif ac in waived:
            state = "waived"
        elif results:
            state = "gap"
            failures.append(f"{ac}: gap (a test that names it did not pass)")
        elif any(not done for _, done in tasks):
            state = "tracked-debt"
        else:
            state = "gap"
        if state == "gap" and not results:
            failures.append(f"{ac}: gap (no passing test and no open task carries it)")
        rows.append({"principles": principles, "requirement": fr, "criterion": ac,
                     "tasks": [t for t, _ in tasks], "tests": [n for n, _ in results], "state": state})
    manifest = {"format": "agentic-trace/1", "spec": spec,
                "gate": {"ok": not failures, "failures": sorted(set(failures))}, "rows": rows}
    from .core import MANIFEST_HOOKS
    for hook in MANIFEST_HOOKS:
        hook(ctx, spec, manifest)
    manifest["gate"]["ok"] = not manifest["gate"]["failures"]
    return manifest


@check("CK-TRACE", ("TRC-1", "TRC-3"), "principles, requirements, criteria, tasks and tests are linked with no gaps or orphans")
def ck_trace(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        for failure in build_manifest(ctx, spec)["gate"]["failures"]:
            res.fail(failure, f"specs/{spec}")


@check("CK-TRACE-GENERATED", ("TRC-4",), "the committed trace manifest is exactly what the kit generates",
       profiles=("standard", "regulated"))
def ck_trace_generated(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        rel = f"specs/{spec}/trace-manifest.json"
        if not ctx.src.exists(rel):
            if ctx.src.exists(f"specs/{spec}/tasks.md"):
                res.fail("tasks.md exists but trace-manifest.json has not been generated", rel)
            continue
        try:
            committed = json.loads(ctx.src.read(rel))
        except json.JSONDecodeError:
            res.fail("trace-manifest.json is not valid JSON", rel)
            continue
        if committed != build_manifest(ctx, spec):
            res.fail("trace-manifest.json differs from a fresh build; regenerate it, do not edit it", rel)


@check("CK-AUDIT-CHAIN", ("TRC-5", "TRC-6"), "audit logs are unbroken hash chains and decisions point into them")
def ck_audit_chain(ctx: Context, res: Result) -> None:
    hashes: dict[str, set[str]] = {}
    for rel in ctx.src.files(f"{KIT_DIR}/audit"):
        if not rel.endswith(".jsonl"):
            continue
        prev, seq = GENESIS, 0
        seen = hashes.setdefault(rel.rsplit("/", 1)[-1][:-6], set())
        for n, line in enumerate(x for x in ctx.src.read(rel).splitlines() if x.strip()):
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                res.fail(f"entry {n + 1} is not valid JSON", rel)
                break
            if entry.get("seq") != seq + 1:
                res.fail(f"entry {n + 1} has sequence {entry.get('seq')}, expected {seq + 1}", rel)
            if entry.get("prev") != prev:
                res.fail(f"entry {entry.get('seq')} does not chain to the entry before it", rel)
            if entry.get("hash") != entry_hash(entry):
                res.fail(f"entry {entry.get('seq')} has been altered (its hash does not match its content)", rel)
            prev, seq = entry.get("hash"), entry.get("seq", seq + 1)
            seen.add(str(prev))
    strict = ctx.profile != "lite"
    for rel, rec in decisions(ctx):
        head = rec.get("audit_head")
        if not head:
            if strict:
                res.fail("the decision does not record the audit log head", rel)
            continue
        if head not in hashes.get(str(rec.get("spec")), set()):
            res.fail("audit_head is not an entry in this spec's audit log", rel)


@check("CK-DRIFT-SPEC", ("TRC-8", "TRC-10"), "code under an approved spec does not change without a spec",
       profiles=("standard", "regulated"))
def ck_drift_spec(ctx: Context, res: Result) -> None:
    changed = ctx.options.get("changed_files")
    if changed is None:
        res.notes.append("skipped: no list of changed files was given (run on the default branch with --changed-files)")
        return
    if any(c.startswith("specs/") for c in changed):
        return
    closed = {str(rec.get("spec")) for _, rec in decisions(ctx)
              if rec.get("gate") == "G5" and rec.get("decision") in ("approve", "approve-with-conditions")}
    for spec in ctx.specs():
        if spec not in closed:
            continue
        paths = spec_front(ctx, spec).get("paths") or []
        from .lanes import emergency_paths
        expected = emergency_paths(ctx)  # an open emergency change is allowed ahead of its retrospective spec
        for c in changed:
            if match_any(c, paths) and not match_any(c, expected):
                res.fail(f"{c} belongs to approved spec {spec} but changed with no spec in the same change", c)


#: metric source -> does it hold any data? Sibling extensions add sources (incidents, runs).
KNOWN_SOURCES = {"audit-log": lambda ctx: any(p.endswith(".jsonl") for p in ctx.src.files(f"{KIT_DIR}/audit"))}


@check("CK-METRIC-SOURCE", ("TRC-11", "TRC-14"), "every configured metric has a data source that exists")
def ck_metric_source(ctx: Context, res: Result) -> None:
    for m in ctx.kit().get("metrics") or []:
        source = m.get("source")
        if source not in KNOWN_SOURCES:
            res.fail(f"metric {m.get('id')} has no usable data source ({source!r})", f"{KIT_DIR}/kit.yml")
        elif not KNOWN_SOURCES[source](ctx):
            res.fail(f"metric {m.get('id')} reads {source}, which is empty", f"{KIT_DIR}/kit.yml")


@check("CK-VERIFY-INPUTS", ("QLT-1",), "the independent verifier received only the artifact, spec, constitution and map")
def ck_verify_inputs(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        # The artifact: the paths the spec names, and what sibling extensions add (the files its tasks name, the
        # files of the components it says it touches). A verifier may also read what the spec says it depends on.
        allowed = [f"specs/{spec}/*", ".specify/memory/constitution.md", f"{KIT_DIR}/constitution.map.yml",
                   "system-map/*"] + list(spec_front(ctx, spec).get("paths") or [])
        for hook in ARTIFACT_HOOKS + READING_HOOKS:
            allowed += hook(ctx, spec)
        # The generated page of the change repeats what the work records say, so it is no verifier's input either (CHS-9).
        banned = [f"specs/{spec}/notes/*", f"specs/{spec}/verification/*", f"{KIT_DIR}/work/*", f"specs/{spec}/changeset.md"]
        for rel in ctx.src.files(f"specs/{spec}/verification"):
            if not rel.endswith("-inputs.yml"):
                continue
            man = ctx.src.yaml(rel) or {}
            if not man.get("verifier") or not man.get("author"):
                res.fail("the manifest must name both the verifier and the author", rel)
            elif man["verifier"] == man["author"]:
                res.fail(f"{man['verifier']} both authored and verified the artifact", rel)
            for item in man.get("inputs") or []:
                if match_any(item, banned) or not match_any(item, allowed):
                    res.fail(f"{item} is not an allowed verifier input", rel)
