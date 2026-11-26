"""AI-system pack (QLT-13 to QLT-19). Applies when the system map has `ai-component` nodes.

An AI node is a model, a prompt, a tool or a retrieval index. The checks read declarations and recorded
results. They do not call a model, run an evaluation or measure anything.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import re

import yaml

from agentic_kit import adapters
from agentic_kit.checks_gov import _approver_problems, _review, people_by_role
from agentic_kit.core import KIT_DIR, Context, KitError, Result, check

from agentic_kit_system import contracts as fmt
from agentic_kit_system.checks_change import _empty, _version_of, base_text, changed_nodes, has_base
from agentic_kit_system.mapmodel import MAP_PATH

from .common import AI_KINDS, SYS, gate_record, load_map, need_sections, plan_specs, spec_tier, touched

CLAIMS = f"{KIT_DIR}/metric-claims.yml"
METRIC_WORDS = r"accura|precision|recall|\bf1\b|uptime|availab|latency|faster|slower|reduc|improv|success rate|error rate|coverage|satisf|conversion"
_FIGURE = re.compile(r"(?<![\w.])\d{1,3}(?:[.,]\d+)?\s?%")
#: Files read as prose. In any other file a figure is also a number given to a name that says what it measures.
PROSE = (".md", ".markdown", ".txt", ".rst", ".adoc", ".html", ".htm")
_NAMED_FIGURE = re.compile(r"(?<![\w.])((?:\w*(?:accura|precision|recall|uptime|availab|latency|coverage|satisf|conversion)\w*|f1|auc))"
                           r"[\"']?\s*[:=]\s*(-?\d+(?:\.\d+)?)(?![\w.])", re.I)


def ai_nodes(smap) -> dict[str, dict]:
    return {nid: n for nid, n in smap.nodes.items() if n.get("type") == "ai-component"} if smap else {}


@check("CK-AI-VERSION", ("QLT-13",), "every model, prompt, tool and retrieval index is versioned, and a change to one changes its version", profiles=SYS)
def ck_ai_version(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    nodes = ai_nodes(smap)
    for nid, n in nodes.items():
        if n.get("kind") not in AI_KINDS:
            res.fail(f"{nid} must say what kind of AI component it is: {', '.join(AI_KINDS)}", MAP_PATH)
        if not _version_of(ctx, n):
            res.fail(f"{nid} has no version (set version or version_file)", MAP_PATH)
    changed = changed_nodes(ctx, smap)
    if changed is None or not has_base(ctx):
        if nodes:
            res.notes.append("skipped the comparison with the previous version: no base ref was given")
        return
    old_map = {}
    if ctx.trusted.ref and ctx.trusted.exists(MAP_PATH):
        old_map = {str(x.get("id")): x for x in (ctx.trusted.yaml(MAP_PATH) or {}).get("nodes") or [] if isinstance(x, dict)}
    for nid in sorted(set(changed) & set(nodes)):
        n = nodes[nid]
        vf = n.get("version_file")
        before = fmt.read_version(vf, base_text(ctx, vf) or "") if vf else str((old_map.get(nid) or {}).get("version") or "")
        if before and before == _version_of(ctx, n):
            res.fail(f"{nid} changed ({len(changed[nid])} file(s)) but its version is still {before}", vf or MAP_PATH)


def _resolve(doc, key: str):
    cur = doc
    for part in str(key).split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
    return cur


def _load(ctx: Context, rel: str):
    text = ctx.src.read(rel)
    try:
        return json.loads(text) if rel.endswith(".json") else yaml.safe_load(text)
    except (ValueError, yaml.YAMLError) as exc:
        raise KitError(f"{rel} cannot be read: {exc}") from exc


def _meets(value, bound) -> bool:
    if not isinstance(value, (int, float)):
        return False
    if isinstance(bound, dict):
        return ("min" not in bound or value >= bound["min"]) and ("max" not in bound or value <= bound["max"])
    return isinstance(bound, (int, float)) and value >= bound


def eval_specs(ctx: Context, smap) -> list[str]:
    return [s for s in plan_specs(ctx) if touched(ctx, smap, s, {"ai-component"}) or ctx.src.exists(f"specs/{s}/ai-eval.yml")]


@check("CK-AI-EVAL", ("QLT-14",), "a change to an AI component has a signed-off golden set, thresholds, and no regression against the last release", profiles=SYS)
def ck_ai_eval(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    holders = people_by_role(ctx.roles())
    tolerance = float(((ctx.kit().get("ai") or {}).get("regression_tolerance")) or 0)
    for spec in eval_specs(ctx, smap):
        rel = f"specs/{spec}/ai-eval.yml"
        if not ctx.src.exists(rel):
            res.fail(f"the spec touches {', '.join(touched(ctx, smap, spec, {'ai-component'}))} but has no evaluation design", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        gs = doc.get("golden_set") or {}
        if not gs.get("path") or not ctx.src.exists(str(gs["path"])):
            res.fail("the golden set does not exist", rel)
        if gs.get("version") in (None, ""):
            res.fail("the golden set has no version", rel)
        if _empty(str(gs.get("provenance") or "")):
            res.fail("the golden set does not say where its cases came from (provenance)", rel)
        who = gs.get("signed_off_by") or {}
        person, role = str(who.get("reviewer") or "").lower(), who.get("role")
        if not person or person not in {p for people in holders.values() for p in people}:
            res.fail("the golden set is not signed off by a person in roles.yml", rel)
        elif role and person not in holders.get(role, set()):
            res.fail(f"{who.get('reviewer')} signed the golden set off as {role} but does not hold that role", rel)
        thresholds = doc.get("thresholds") or {}
        if not thresholds:
            res.fail("the spec sets no thresholds for the evaluation", rel)
        baseline = doc.get("baseline") or {}
        base_metrics = None
        if doc.get("first_release") is True:
            res.notes.append(f"{spec}: first release, so there is no baseline to regress against")
        elif not baseline.get("results") or not ctx.src.exists(str(baseline["results"])):
            res.fail("there is no baseline from the last release to compare with (baseline.results), and this is not marked first_release", rel)
        else:
            base_metrics = (_load(ctx, str(baseline["results"])) or {}).get("metrics") or {}
        if gate_record(ctx, spec, "G6") is None:
            continue
        results = str(doc.get("results") or "")
        if not results or not ctx.src.exists(results):
            res.fail("G6 is approved but the evaluation has no recorded results", rel)
            continue
        out = _load(ctx, results) or {}
        metrics = out.get("metrics") or {}
        if out.get("golden_set_version") != gs.get("version"):
            res.fail(f"the results are for golden set version {out.get('golden_set_version')}, not {gs.get('version')}", results)
        for name, bound in thresholds.items():
            if not _meets(metrics.get(name), bound):
                res.fail(f"{name} is {metrics.get(name)}, which does not meet the threshold {bound}", results)
        for name, was in (base_metrics or {}).items():
            now = metrics.get(name)
            lower_is_better = isinstance(thresholds.get(name), dict) and "max" in thresholds[name]
            if isinstance(was, (int, float)) and isinstance(now, (int, float)) and \
                    ((now > was + tolerance) if lower_is_better else (now < was - tolerance)):
                res.fail(f"{name} regressed against the last released baseline ({was} to {now}); this blocks G6", results)


@check("CK-AI-PROD-PATH", ("QLT-15",), "the evaluation calls the production code, not a copy of it", profiles=SYS)
def ck_ai_prod_path(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    for spec in eval_specs(ctx, smap):
        rel = f"specs/{spec}/ai-eval.yml"
        if not ctx.src.exists(rel):
            continue  # CK-AI-EVAL reports it
        doc = ctx.src.yaml(rel) or {}
        entry, harness = str(doc.get("entrypoint") or ""), str(doc.get("harness") or "")
        if "::" not in entry:
            res.fail("the evaluation names no production entry point (entrypoint: <file>::<symbol>)", rel)
            continue
        path, symbol = entry.split("::", 1)
        if not ctx.src.exists(path) or not re.search(rf"\b{re.escape(symbol)}\b", ctx.src.read(path)):
            res.fail(f"{symbol} is not defined in {path}", rel)
            continue
        if not harness or not ctx.src.exists(harness):
            res.fail("the evaluation names no harness that exists", rel)
            continue
        code = ctx.src.read(harness)
        stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if not re.search(rf"\b{re.escape(symbol)}\b", code) or (stem not in code and path not in code):
            res.fail(f"the harness never refers to {symbol} in {path}: it does not exercise the production code path", harness)
        if re.search(rf"\b(def|class|function|func|fn)\s+{re.escape(symbol)}\b|\b{re.escape(symbol)}\s*=\s*(lambda|function|async|\()", code):
            res.fail(f"the harness defines its own {symbol} instead of calling the production one", harness)
        for line in code.splitlines():
            if symbol in line and re.search(r"\b(mock|patch|stub|fake)\w*\b", line, re.I):
                res.fail(f"the harness replaces {symbol} with a stand-in: {line.strip()[:100]}", harness)
                break
        results = str(doc.get("results") or "")
        if results and ctx.src.exists(results):
            out = _load(ctx, results) or {}
            current = hashlib.sha256(ctx.src.read_bytes(path)).hexdigest()
            if out.get("entrypoint") != entry:
                res.fail(f"the results record entry point {out.get('entrypoint')!r}, not {entry}", results)
            elif out.get("entrypoint_sha256") != current:
                res.fail(f"the results were produced against a different version of {path}; run the evaluation again", results)
    res.notes.append("this is a static proof: the harness names the production symbol, does not redefine or stub it, "
                     "and the results carry the hash of the production file")


@check("CK-AI-SAFETY-CASE", ("QLT-16",), "critical AI behaviour has a safety case that a named person accepted", profiles=SYS)
def ck_ai_safety_case(ctx: Context, res: Result) -> None:
    smap = load_map(ctx, required=False)
    adapter = None
    for spec in plan_specs(ctx):
        hit = touched(ctx, smap, spec, {"ai-component"})
        if not hit or spec_tier(ctx, smap, spec) != "critical":
            continue
        rel = f"specs/{spec}/safety-case.md"
        if not ctx.src.exists(rel):
            res.fail(f"the spec changes critical AI behaviour ({', '.join(hit)}) but has no safety case", rel)
            continue
        need_sections(res, ctx, rel, ["Claim", "Evidence", "Residual risk", "Human-in-the-loop control"])
        from agentic_kit.core import front_matter
        ap = front_matter(ctx.src.read(rel)).get("accepted_by") or {}
        adapter = adapter or adapters.enforcement(ctx)
        change, review = _review(adapter, ap.get("review_ref"))
        if review is None:
            res.fail("the safety case was not accepted through the enforcement channel (accepted_by.review_ref)", rel)
            continue
        problems = _approver_problems(ctx, adapter, people_by_role(ctx.roles()), review, change, ap.get("reviewer", ""), ap.get("role"))
        if review.state != "APPROVED":
            problems.append(f"the review state is {review.state or 'unknown'}, not APPROVED")
        for p in problems:
            res.fail(f"safety case acceptance: {p}", rel)


@check("CK-AI-RETRIEVAL", ("QLT-17",), "each retrieval index records its sources, its refresh, how retrieved text is kept apart, and its attack tests", profiles=SYS)
def ck_ai_retrieval(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for nid, n in ai_nodes(smap).items():
        if n.get("kind") != "retrieval-index":
            continue
        for key, what in (("provenance", "where its content comes from"), ("refresh", "how and when it is refreshed")):
            if _empty(str(n.get(key) or "")):
                res.fail(f"{nid} does not record {what} ({key})", MAP_PATH)
        sep = n.get("separation") or {}
        for key, what in (("instructions", "instructions"), ("classifier_input", "classifier input")):
            if _empty(str(sep.get(key) or "")):
                res.fail(f"{nid} does not say how retrieved content is kept separate from {what} (separation.{key})", MAP_PATH)
        tests = n.get("tests") or {}
        for key, what in (("prompt_injection", "prompt-injection"), ("data_leak", "data-leak")):
            if not tests.get(key) or not (ctx.src.exists(str(tests[key])) or ctx.src.files(str(tests[key]).rstrip("/"))):
                res.fail(f"{nid} has no {what} test that exists (tests.{key})", MAP_PATH)


@check("CK-AI-RUNTIME", ("QLT-18",), "each model has latency and cost budgets, a fallback, logging that leaves out protected data, and a kill switch", profiles=SYS)
def ck_ai_runtime(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for nid, n in ai_nodes(smap).items():
        if n.get("kind") != "model":
            continue
        rt = n.get("runtime") or {}
        if not isinstance(rt.get("latency_budget_ms"), (int, float)):
            res.fail(f"{nid} has no latency budget (runtime.latency_budget_ms)", MAP_PATH)
        for key, what in (("cost_budget", "cost budget"), ("fallback", "fallback for when the model is unavailable"), ("kill_switch", "kill switch")):
            if _empty(str(rt.get(key) or "")):
                res.fail(f"{nid} has no {what} (runtime.{key})", MAP_PATH)
        if rt.get("logging_excludes_classified") is not True:
            res.fail(f"{nid} does not state that its logging leaves out protected data (runtime.logging_excludes_classified: true)", MAP_PATH)


def _number(text: str) -> tuple[float, int] | None:
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(text))
    if not m:
        return None
    raw = m.group(0).replace(",", ".")
    return float(raw), len(raw.split(".")[1]) if "." in raw else 0


def _matches(claim: str, source) -> bool:
    """Does the figure as shown equal the recorded number, at the precision it is shown with?"""
    parsed = _number(claim)
    if parsed is None or not isinstance(source, (int, float)):
        return str(source).strip() == str(claim).strip()
    shown, places = parsed
    candidates = [source, source * 100] if "%" in str(claim) else [source]
    return any(round(c, places) == round(shown, places) for c in candidates)


@check("CK-METRIC-PROVENANCE", ("QLT-19",), "every figure shown to users or in reports traces to a recorded evaluation or telemetry source", profiles=SYS)
def ck_metric_provenance(ctx: Context, res: Result) -> None:
    doc = (ctx.src.yaml(CLAIMS) or {}) if ctx.src.exists(CLAIMS) else {}
    registered: dict[str, set[str]] = {}
    for c in doc.get("claims") or []:
        cid, value = c.get("id", "?"), str(c.get("value") or "")
        src = c.get("source") or {}
        if not value:
            res.fail(f"claim {cid} states no value", CLAIMS)
            continue
        for where in c.get("where") or []:
            registered.setdefault(str(where), set()).add(re.sub(r"\s", "", value))
            if not ctx.src.exists(str(where)) or value not in ctx.src.read(str(where)):
                res.fail(f"claim {cid}: {value} does not appear in {where}", CLAIMS)
        if src.get("kind") not in ("evaluation", "telemetry"):
            res.fail(f"claim {cid} must come from an evaluation or from telemetry", CLAIMS)
        if not src.get("path") or not ctx.src.exists(str(src["path"])):
            res.fail(f"claim {cid} cites a source that does not exist ({src.get('path')})", CLAIMS)
        elif src.get("key"):
            recorded = _resolve(_load(ctx, str(src["path"])), src["key"])
            if recorded is None:
                res.fail(f"claim {cid}: {src['path']} has no value at {src['key']}", CLAIMS)
            elif not _matches(value, recorded):
                res.fail(f"claim {cid} shows {value}, but the recorded value at {src['key']} is {recorded}", CLAIMS)
    cfg = ctx.kit().get("metric_claims") or {}
    scan, allow = list(cfg.get("scan") or ["README.md"]), [re.compile(a) for a in cfg.get("allow") or []]
    for rel in ctx.src.files():
        if not any(fnmatch.fnmatch(rel, g) for g in scan):
            continue
        code = not rel.lower().endswith(PROSE)
        for n, line in enumerate(ctx.src.read(rel).splitlines(), 1):
            if any(a.search(line) for a in allow):
                continue
            if re.search(METRIC_WORDS, line, re.I):
                for figure in _FIGURE.findall(line):
                    if re.sub(r"\s", "", figure) not in registered.get(rel, set()):
                        res.fail(f"the figure {figure.strip()} has no recorded source; register it in {CLAIMS} or remove it", f"{rel}:{n}")
            if code:  # a figure in code or data: a number given to a name that says what it measures
                for name, number in _NAMED_FIGURE.findall(line):
                    if number not in registered.get(rel, set()):
                        res.fail(f"the figure {name} = {number} has no recorded source; register it in {CLAIMS} or remove it", f"{rel}:{n}")
