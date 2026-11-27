"""Infrastructure, release and operability packs (CHG-16, CHG-17, CHG-19 to CHG-21, QLT-20)."""
from __future__ import annotations

import datetime
import json

from agentic_kit.checks_gov import as_date, today
from agentic_kit.core import KIT_DIR, Context, Result, check

from agentic_kit_system import engines as eng
from agentic_kit_system.checks_change import DEPLOYABLE, ROLLOUT, _empty
from agentic_kit_system.mapmodel import MAP_PATH, tier_rank

from .common import SYS, gate_record, load_map, need_sections, plan_specs, spec_ids, spec_tier, touched, touches

ENVIRONMENTS = f"{KIT_DIR}/environments.yml"
READINESS = ["Service objectives touched", "Telemetry added", "Alerts", "Dashboards", "Runbook changes"]


@check("CK-INFRA-CHANGE", ("CHG-16",), "an infrastructure change states its impact, passes policy checks and fits a stated budget", profiles=SYS)
def ck_infra_change(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for spec in plan_specs(ctx):
        infra = touched(ctx, smap, spec, {"infrastructure"})
        if not infra:
            continue
        rel = f"specs/{spec}/infra-change.yml"
        if not ctx.src.exists(rel):
            res.fail(f"the spec touches infrastructure ({', '.join(infra)}) but has no infrastructure change record", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        if _empty(str(doc.get("impact") or "")):
            res.fail("the record does not state the impact of the change", rel)
        policy = doc.get("policy_checks") or {}
        if policy.get("result") != "pass" or not policy.get("tool"):
            res.fail(f"policy-as-code checks did not pass or name no tool (result: {policy.get('result')})", rel)
        elif not policy.get("report") or not ctx.src.exists(str(policy["report"])):
            res.fail("the policy check has no report that exists", rel)
        cost = doc.get("cost") or {}
        estimate, budget = cost.get("estimate_monthly"), cost.get("budget_monthly")
        if not isinstance(estimate, (int, float)) or not isinstance(budget, (int, float)):
            res.fail("the record needs a monthly cost estimate and the budget it is held against", rel)
            continue
        for nid in infra:
            stated = smap.nodes[nid].get("budget_monthly")
            if isinstance(stated, (int, float)) and stated != budget:
                res.fail(f"the record uses a budget of {budget}, but the map states {stated} for {nid}", rel)
        if estimate > budget:
            res.fail(f"the estimate ({estimate}) is over the stated budget ({budget})", rel)


@check("CK-ENV-PARITY", ("CHG-17",), "the environment parity matrix is kept, and every difference between environments is reported", profiles=SYS)
def ck_env_parity(ctx: Context, res: Result) -> None:
    required = ctx.profile == "regulated" or bool((ctx.kit().get("environments") or {}).get("required"))
    if not ctx.src.exists(ENVIRONMENTS):
        if required:
            res.fail("there is no environment parity matrix", ENVIRONMENTS)
        else:
            res.notes.append("no environment parity matrix; it is required at Regulated, or when kit.yml sets environments.required")
        return
    doc = ctx.src.yaml(ENVIRONMENTS) or {}
    envs = [str(e) for e in doc.get("environments") or []]
    reference = str(doc.get("reference") or "")
    if len(envs) < 2 or reference not in envs:
        res.fail("the matrix needs at least two environments and a reference that is one of them", ENVIRONMENTS)
        return
    now = today(ctx)
    allowed = {}
    for a in doc.get("allowed_drift") or []:
        exp = as_date(a.get("expires"))
        if not a.get("reason") or exp is None:
            res.fail(f"allowed drift for {a.get('key')} needs a reason and an expiry date", ENVIRONMENTS)
        elif exp < now:
            res.fail(f"allowed drift for {a.get('key')} expired on {exp}", ENVIRONMENTS)
        else:
            allowed[str(a.get("key"))] = exp
    matrix = doc.get("matrix") or {}
    for key, row in matrix.items():
        row = row if isinstance(row, dict) else {}
        missing = [e for e in envs if e not in row]
        if missing:
            res.fail(f"{key} has no value for {', '.join(missing)}", ENVIRONMENTS)
            continue
        different = sorted(e for e in envs if str(row[e]) != str(row[reference]))
        if different and key not in allowed:
            res.fail(f"drift: {key} is {row[reference]} in {reference} but " + ", ".join(f"{row[e]} in {e}" for e in different), ENVIRONMENTS)
        elif different:
            res.notes.append(f"{key} differs in {', '.join(different)}; allowed until {allowed[key]}")
    smap = load_map(ctx, required=False)
    for nid, n in (smap.nodes.items() if smap else []):
        if n.get("type") == "data-store" and n.get("engine_version"):
            row = matrix.get(f"{nid}.engine_version")
            if not isinstance(row, dict):
                res.fail(f"the matrix has no row for {nid}.engine_version", ENVIRONMENTS)
            elif eng.major(row.get(reference)) != eng.major(n["engine_version"]):
                res.fail(f"{reference} runs {nid} on version {row.get(reference)}, but the system map says {n['engine_version']}", ENVIRONMENTS)


@check("CK-PROGRESSIVE", ("CHG-19",), "a high-risk change is rolled out in stages with signals that halt it and a rollback trigger", profiles=SYS)
def ck_progressive(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for spec in plan_specs(ctx):
        tier = spec_tier(ctx, smap, spec)
        if tier_rank(tier) < tier_rank("high") or not touched(ctx, smap, spec, DEPLOYABLE):
            continue
        rel = f"specs/{spec}/{ROLLOUT}"
        if not ctx.src.exists(rel):
            res.fail(f"a {tier}-tier change to something deployed needs a rollout plan", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        stages = doc.get("stages") or []
        if len(stages) < 2 or any(not isinstance(s, dict) or not s.get("name") or not s.get("scope") for s in stages):
            res.fail("the rollout needs at least two stages, each with a name and a scope", rel)
        if not doc.get("halt_signals"):
            res.fail("the rollout names no health signal that halts it", rel)
        if _empty(str(doc.get("rollback_trigger") or "")):
            res.fail("the rollout states no rollback trigger", rel)
        if tier == "critical":
            # A rollback can only be rehearsed once the change is built, so the plan says how it will be rehearsed
            # and the release shows that it was.
            rehearsal = doc.get("rollback_rehearsal") or {}
            rehearsed = as_date(rehearsal.get("date")) is not None and bool(rehearsal.get("evidence")) and ctx.src.exists(str(rehearsal["evidence"]))
            if gate_record(ctx, spec, "G7") is not None:
                if not rehearsed:
                    res.fail("G7 is approved but the rollback of this critical change was not rehearsed: the rollout needs the rehearsal's date and evidence that exists", rel)
            elif not rehearsed and _empty(str(rehearsal.get("plan") or "")):
                res.fail("a critical change needs a rollback rehearsal before release: the rollout must say how the rollback will be rehearsed (rollback_rehearsal.plan)", rel)


@check("CK-FLAG", ("CHG-20",), "every feature flag has an owner, a default and a removal date that has not passed", profiles=SYS)
def ck_flag(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    now = today(ctx)
    flags = {nid: n for nid, n in smap.nodes.items() if n.get("type") == "feature-flag"}
    for nid, n in flags.items():
        if not n.get("owner"):
            res.fail(f"flag {nid} has no owner", MAP_PATH)
        if n.get("default") is None:
            res.fail(f"flag {nid} has no default", MAP_PATH)
        remove_by = as_date(n.get("remove_by"))
        if remove_by is None:
            res.fail(f"flag {nid} has no removal date (remove_by)", MAP_PATH)
        elif remove_by < now:
            res.fail(f"flag {nid} was due for removal on {remove_by}", MAP_PATH)
    for spec in plan_specs(ctx):
        rel = f"specs/{spec}/{ROLLOUT}"
        if ctx.src.exists(rel):
            for flag in (ctx.src.yaml(rel) or {}).get("flags") or []:
                if str(flag) not in flags:
                    res.fail(f"the rollout relies on flag {flag}, which is not a feature-flag node in the system map", rel)


def production_criteria(ctx: Context, spec: str) -> list[str]:
    """Acceptance criteria the spec marks as checkable in production: an `[in production]` tag on the criterion's line."""
    import re
    return sorted(set(re.findall(r"\b(AC-[0-9]+)\b[^\n]*\[in production\]", ctx.src.read(f"specs/{spec}/spec.md"), re.I)))


def _released_at(ctx: Context, spec: str) -> datetime.date | None:
    rel = f"{KIT_DIR}/audit/{spec}.jsonl"
    if not ctx.src.exists(rel):
        return None
    when = None
    for line in ctx.src.read(rel).splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("action") == "gate.decision" and e.get("gate") == "G7" and e.get("decision") in ("approve", "approve-with-conditions"):
            when = as_date(str(e.get("at", ""))[:10])
    return when


@check("CK-POST-RELEASE", ("CHG-21",), "criteria that can only be checked in production are checked after release, and the result closes the trace", profiles=SYS)
def ck_post_release(ctx: Context, res: Result) -> None:
    days = int(((ctx.kit().get("release") or {}).get("verify_within_days")) or 7)
    now = today(ctx)
    for spec in ctx.specs():
        rel = f"specs/{spec}/release/production-checks.yml"
        wanted = production_criteria(ctx, spec)
        known = spec_ids(ctx, spec, "AC")
        results = {}
        released = _released_at(ctx, spec)
        if ctx.src.exists(rel):
            for c in (ctx.src.yaml(rel) or {}).get("checks") or []:
                ac = str(c.get("criterion"))
                results[ac] = c
                when = as_date(c.get("date"))
                if ac not in known:
                    res.fail(f"a production check names {ac}, which is not an acceptance criterion of the spec", rel)
                elif c.get("result") != "pass":
                    res.fail(f"{ac} was checked in production and did not pass (result: {c.get('result')})", rel)
                elif not c.get("checked_by") or when is None:
                    res.fail(f"the production check of {ac} does not say who checked it and when", rel)
                elif when > now:  # a check that has not happened yet closes nothing (REV-7)
                    res.fail(f"the production check of {ac} is dated {when}, which is after today ({now})", rel)
                elif released is not None and when < released:
                    res.fail(f"the production check of {ac} is dated {when}, before the release on {released}; "
                             "what is checked in production is checked after the release", rel)
        if gate_record(ctx, spec, "G7") is None:
            continue
        for ac in wanted:
            if ac in results:
                continue
            if released is not None and now > released + datetime.timedelta(days=days):
                res.fail(f"{ac} was to be checked in production within {days} days of release ({released}) and has not been", rel)
            else:
                res.notes.append(f"{spec}: {ac} is still to be checked in production")


@check("CK-OPS-READINESS", ("QLT-20",), "a release states its operational readiness: objectives, telemetry, alerts, dashboards, runbooks", profiles=SYS)
def ck_ops_readiness(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        rel = f"specs/{spec}/release/operational-readiness.md"
        releasing = gate_record(ctx, spec, "G7") is not None or any(f != rel for f in ctx.src.files(f"specs/{spec}/release"))
        if not releasing:
            continue
        if not ctx.src.exists(rel):
            res.fail("the spec is being released without an operational readiness statement", rel)
            continue
        need_sections(res, ctx, rel, READINESS)
        found = gate_record(ctx, spec, "G7")
        if found and rel not in [str(f) for f in (found[1].get("evidence") or {}).get("files") or []]:
            res.fail("the operational readiness statement was not part of the evidence approved at G7", found[0])
