"""agentic-spec-kit quality extension (slice 0.4): security, privacy, test depth, AI systems, release and feedback packs.

Builds on the system extension (the system map). Importing this package registers its checks, commands and fixtures.
"""
from __future__ import annotations

import sys

import yaml

from agentic_kit import core

try:
    import agentic_kit_system  # noqa: F401  (the quality packs read the system map)
except ImportError as exc:  # pragma: no cover - an installation problem, reported plainly
    raise ImportError("the agentic-quality extension needs the agentic-system extension installed beside it") from exc

from agentic_kit_system.mapmodel import CONTRACT_TYPES, DATA_TYPES, load_map, restricted_classes

from . import checks_ai, checks_feedback, checks_quality, checks_release, sample
from .common import spec_tier, touched, touches

__version__ = "0.4.0"

core.SAMPLE_HOOKS.append(sample.extend_sample)
core.FIXTURE_HOOKS.append(sample.fixtures)
core.VIEW_HOOKS["debt"] = lambda ctx: checks_feedback.render_debt(checks_feedback.debt_register(ctx))


def _metrics(ctx) -> list[dict]:
    """TRC-12: defects that reached production, from the incident records."""
    found = checks_feedback.escaped_defects(ctx)
    if not found["total"]:
        return []
    by_gate = ", ".join(f"{g}: {n}" for g, n in found["by_gate"].items())
    return [{"metric": "Defects that escaped to production", "value": f"{found['total']} (by the gate that should have caught them: {by_gate})", "source": "incident records"}]


core.METRIC_HOOKS.append(_metrics)

QUALITY_CHECKS = ["CK-THREAT-MODEL", "CK-SECURITY-EVIDENCE", "CK-PRIVACY-IMPACT", "CK-TEST-STRATEGY", "CK-CHARACTERIZATION", "CK-TEST-DATA", "CK-A11Y",
                  "CK-AI-VERSION", "CK-AI-EVAL", "CK-AI-PROD-PATH", "CK-AI-SAFETY-CASE", "CK-AI-RETRIEVAL", "CK-AI-RUNTIME", "CK-METRIC-PROVENANCE",
                  "CK-INFRA-CHANGE", "CK-ENV-PARITY", "CK-PROGRESSIVE", "CK-FLAG", "CK-POST-RELEASE", "CK-OPS-READINESS", "CK-ADR", "CK-INCIDENT-LOOP"]
PLAN_EVIDENCE = ["threat-model.yml", "privacy-impact.md", "test-strategy.yml", "ai-eval.yml", "safety-case.md", "infra-change.yml"]


def _register() -> None:
    from agentic_kit import __main__ as cli
    from agentic_kit import checks_trace, selftest
    cli.DEFAULT_EVIDENCE["G3"] += [f for f in PLAN_EVIDENCE if f not in cli.DEFAULT_EVIDENCE["G3"]]
    plan = selftest.GATE_PLAN["G3"][0]
    plan += [f for f in ("threat-model.yml", "test-strategy.yml") if f not in plan]
    shown = selftest.GATE_PLAN["G5"][0]
    shown += [f for f in sample.SECURITY_FILES if f not in shown]
    checks_trace.KNOWN_SOURCES["incidents"] = lambda ctx: bool(checks_feedback.incidents(ctx))


_register()


def skeletons(ctx, spec: str) -> list[tuple[str, str]]:
    """(path, text) of each quality file this spec needs and does not have yet."""
    smap = load_map(ctx, required=False)
    base = f"specs/{spec}"
    tier = spec_tier(ctx, smap, spec)
    out = [(f"{base}/threat-model.yml",
            "schema: agentic-threats/1\n# One entry per threat. `mitigation` is a requirement id; `test` is an acceptance criterion written as an abuse case.\n"
            "threats:\n  - id: TH-1\n    threat: TBD\n    category: TBD\n    mitigation: FR-000\n    test: AC-000\n"
            "# If there is truly no threat, delete the list and say why:\n# none_because: ...\n")]
    kinds = checks_quality.mandatory_kinds(ctx, smap, spec, tier)
    strategy = f"schema: agentic-test-strategy/1\ntier: {tier}\nkinds:\n" + "".join(f"  {k}: {{evidence: TBD}}\n" for k in kinds)
    if tier == "critical":
        strategy += "mutation: {threshold: 60, score: null, report: TBD}\nnegative_boundary: {}   # AC id -> the negative and boundary tests for it\n"
        deps = checks_quality.external_dependencies(ctx, smap, spec)
        if deps:
            strategy += ("resilience:   # per dependency: the resilience test, or {not_relied_on: <why the change does not rely on it>}\n"
                         + "".join(f"  {d}: TBD\n" for d in deps))
    out.append((f"{base}/test-strategy.yml", strategy))
    if smap is not None:
        protected = restricted_classes(ctx)
        classified = [t for t in touches(ctx, spec) if (smap.nodes.get(t) or {}).get("classification") in protected]
        if classified:
            out.append((f"{base}/privacy-impact.md", f"# Privacy impact: {spec}\n\nProtected data touched: {', '.join(classified)}.\n\n"
                        + "".join(f"## {h}\nTBD\n\n" for h in checks_quality.PRIVACY)))
        if touched(ctx, smap, spec, {"ai-component"}):
            out.append((f"{base}/ai-eval.yml",
                        "schema: agentic-ai-eval/1\ngolden_set: {path: TBD, version: 1, provenance: TBD, signed_off_by: {reviewer: TBD, role: TBD}}\n"
                        "thresholds: {}          # metric: minimum, or metric: {max: n} where lower is better\n"
                        "baseline: {release: TBD, results: TBD}   # or: first_release: true\n"
                        "entrypoint: TBD         # <production file>::<symbol the evaluation must call>\nharness: TBD\nresults: TBD\n"))
            if tier == "critical":
                out.append((f"{base}/safety-case.md", "---\naccepted_by: {reviewer: TBD, role: TBD, review_ref: TBD}\n---\n# Safety case\n\n"
                            + "".join(f"## {h}\nTBD\n\n" for h in ("Claim", "Evidence", "Residual risk", "Human-in-the-loop control"))))
        if touched(ctx, smap, spec, {"infrastructure"}):
            out.append((f"{base}/infra-change.yml", "impact: TBD\npolicy_checks: {tool: TBD, result: TBD, report: TBD}\n"
                        "cost: {estimate_monthly: null, budget_monthly: null, currency: USD}\n"))
    return [(rel, text) for rel, text in out if not ctx.src.exists(rel)]


def cmd_quality(args) -> int:
    from agentic_kit.__main__ import _context, _report
    ctx = _context(args)
    if args.action == "check":
        return _report([core.run_check(c, ctx) for c in QUALITY_CHECKS], args.json)
    if args.action == "debt":
        print(checks_feedback.render_debt(checks_feedback.debt_register(ctx)))
        return 0
    if not args.spec:
        print("--spec is required", file=sys.stderr)
        return 2
    todo = skeletons(ctx, args.spec)
    for rel, text in todo:
        if args.write:
            path = ctx.src.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {rel}")
        else:
            print(f"--- {rel} ---\n{text}")
    if not todo:
        print("every quality file this spec needs already exists")
    return 0


def _cli(sub, common) -> None:
    sp = sub.add_parser("quality", help="quality packs: scaffold what a spec needs, run the pack checks, list the technical debt")
    common(sp)
    sp.add_argument("action", choices=["plan", "check", "debt"])
    sp.add_argument("--spec")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--changed-files")
    sp.add_argument("--today")
    sp.set_defaults(fn=cmd_quality)


core.CLI_HOOKS.append(_cli)
