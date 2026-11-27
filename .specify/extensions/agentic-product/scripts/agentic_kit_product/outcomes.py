"""Outcomes (PRD-14, PRD-15): a change says what it expects to move, and someone looks afterwards.

A spec is a bet. `outcomes.yml` states the bet before the first gate: the measure, where it stands, where it should
get to, where the number comes from, and when to look. After release, on that date, a named person records what
happened. A bet that did not pay off becomes a new intake item or a recorded decision to accept it.
"""
from __future__ import annotations

from agentic_kit.checks_gov import as_date, today
from agentic_kit.core import TIERS, Context, Result, check

from . import common
from .intake import decided_by_problem, records

OUTCOMES = "outcomes.yml"
REVIEW = "outcomes-review.yml"
SCHEMA = "agentic-outcomes/1"
FIELDS = ("hypothesis", "metric", "baseline", "target", "source", "review_by")
RESULTS = ("met", "not-met", "inconclusive")


def from_tier(ctx: Context) -> str:
    return str(((common.cfg(ctx).get("outcomes") or {}).get("from_tier")) or "medium")


def needed(ctx: Context, spec: str) -> bool:
    tier = common.front(ctx, spec).get("tier_declared")
    floor = from_tier(ctx)
    return tier in TIERS and floor in TIERS and TIERS.index(tier) >= TIERS.index(floor)


def outcomes(ctx: Context, spec: str) -> dict | None:
    rel = f"specs/{spec}/{OUTCOMES}"
    data = ctx.src.yaml(rel) if ctx.src.exists(rel) else None
    return data if isinstance(data, dict) else None


@check("CK-OUTCOME", ("PRD-14", "PRD-15"), "a change states the result it expects before its first gate, and a person records what happened after release",
       profiles=("standard", "regulated"))
def ck_outcome(ctx: Context, res: Result) -> None:
    if common.index(ctx) is None:
        res.notes.append("living specs are not in use in this repository")
        return
    done = set(common.merged(ctx))
    intake_ids = {str(r.get("id")) for _, r in records(ctx)}
    for spec in common.in_scope(ctx):
        if not needed(ctx, spec):
            continue
        rel = f"specs/{spec}/{OUTCOMES}"
        data = outcomes(ctx, spec)
        if data is None:
            res.fail(f"a {common.front(ctx, spec).get('tier_declared')}-tier change must say what result it expects ({OUTCOMES}), or `none_because:`",
                     f"specs/{spec}/spec.md")
            continue
        if data.get("schema") != SCHEMA:
            res.fail(f"schema must be {SCHEMA}", rel)
        items = data.get("outcomes") or []
        if not items:
            if not str(data.get("none_because") or "").strip():
                res.fail("list at least one outcome, or say under `none_because:` why this change has none to measure", rel)
            continue
        due = []
        for o in items:
            oid = str((o or {}).get("id", "?"))
            for f in FIELDS:
                if not str((o or {}).get(f) if (o or {}).get(f) is not None else "").strip():
                    res.fail(f"outcome {oid} has no {f}", rel)
            when = as_date((o or {}).get("review_by"))
            if (o or {}).get("review_by") and when is None:
                res.fail(f"outcome {oid} review_by is not a date", rel)
            if when and spec in done and today(ctx) > when:
                due.append((oid, when))
        if not due:
            continue
        rrel = f"specs/{spec}/{REVIEW}"
        reviews = {}
        if ctx.src.exists(rrel):
            for r in ((ctx.src.yaml(rrel) or {}).get("reviews") or []):
                if isinstance(r, dict):
                    reviews[str(r.get("outcome"))] = r
        for oid, when in due:
            r = reviews.get(oid)
            if r is None:
                res.fail(f"outcome {oid} was due for review on {when} and nobody has recorded what happened ({REVIEW})", rel)
                continue
            if r.get("result") not in RESULTS:
                res.fail(f"the review of {oid} must give result: {', '.join(RESULTS)}", rrel)
            if r.get("measured") in (None, ""):
                res.fail(f"the review of {oid} does not say what was measured", rrel)
            if not str(r.get("evidence") or "").strip():
                res.fail(f"the review of {oid} names no evidence", rrel)
            problem = decided_by_problem(ctx, r.get("reviewed_by"))
            if problem:
                res.fail(f"the review of {oid} {problem}", rrel)
            if r.get("result") == "not-met":
                follow = str(r.get("follow_up") or "")
                if follow not in intake_ids and not follow.lower().startswith("accept:"):
                    res.fail(f"{oid} was not met. `follow_up` must be the intake record that picks it up, or `accept: <reason>`", rrel)
