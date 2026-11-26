"""Shared helpers for the quality packs."""
from __future__ import annotations

from agentic_kit.checks_gov import decisions, spec_front
from agentic_kit.core import TIERS, Context

from agentic_kit_system.checks_change import _empty, plan_specs, sections  # noqa: F401  (re-exported)
from agentic_kit_system.checks_map import SYS, approved_gates, touches  # noqa: F401
from agentic_kit_system.mapmodel import SystemMap, load_map, tier_rank  # noqa: F401

AI_KINDS = ("model", "prompt", "tool", "retrieval-index")


def spec_tier(ctx: Context, smap: SystemMap | None, spec: str) -> str:
    """The higher of the tier the spec declares and the tier of what it touches."""
    tiers = [spec_front(ctx, spec).get("tier_declared")]
    if smap is not None:
        tiers += [(smap.nodes.get(t) or {}).get("tier") for t in touches(ctx, spec)]
    return max((t for t in tiers if t in TIERS), key=tier_rank, default="low")


def touched(ctx: Context, smap: SystemMap | None, spec: str, types: set[str]) -> list[str]:
    if smap is None:
        return []
    return [t for t in touches(ctx, spec) if (smap.nodes.get(t) or {}).get("type") in types]


def gate_record(ctx: Context, spec: str, gate: str) -> tuple[str, dict] | None:
    for rel, rec in decisions(ctx):
        if str(rec.get("spec")) == spec and rec.get("gate") == gate and rec.get("decision") in ("approve", "approve-with-conditions"):
            return rel, rec
    return None


def spec_ids(ctx: Context, spec: str, prefix: str) -> set[str]:
    """Requirement (FR) or acceptance-criterion (AC) ids that appear in a spec."""
    import re
    return set(re.findall(rf"\b{prefix}-[0-9]+\b", ctx.src.read(f"specs/{spec}/spec.md")))


def need_sections(res, ctx: Context, rel: str, headings: list[str]) -> dict[str, str]:
    secs = sections(ctx.src.read(rel))
    for h in headings:
        if h not in secs:
            res.fail(f"there is no section '{h}'", rel)
        elif _empty(secs[h]):
            res.fail(f"section '{h}' is empty", rel)
    return secs
