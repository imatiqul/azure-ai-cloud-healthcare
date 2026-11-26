"""The pipeline entry point (PIP-1 to PIP-5): one non-interactive command any CI/CD system can run.

`connect run` runs every check, works out what changed, tells people, and exits with the check result. It takes no
input and asks no question. `connect mirror` turns pull-request reviews that already carry a gate's approval line
into decision records; it creates no approval, and CK-APPROVER and CK-GATE-MIRROR still judge the review itself.
"""
from __future__ import annotations

import argparse

from agentic_kit import adapters
from agentic_kit.checks_gov import required_gates
from agentic_kit.core import REGISTRY, Context, KitError, evidence_hash, run_check
from agentic_kit.lanes import approved_records

from . import notify

def run_checks(ctx: Context) -> list:
    return [run_check(cid, ctx) for cid in sorted(REGISTRY) if cid != "CK-SELFTEST"]


def exit_code(ctx: Context, results: list) -> int:
    if any(r.findings for r in results):
        return 1
    if any(r.not_run for r in results):
        try:
            return 0 if ctx.profile == "lite" else 2
        except KitError:
            return 2
    return 0


def summary(ctx: Context, results: list, events: list, deliveries: list, templates: dict | None = None) -> str:
    failed = [r for r in results if r.findings]
    not_run = [r for r in results if r.not_run]
    lines = ["# agentic-spec-kit", "", f"**Checks:** {len(results) - len(failed) - len(not_run)} passed, {len(failed)} failed, {len(not_run)} not run"]
    for r in failed:
        lines += [f"- **{r.check}** failed"] + [f"  - {f.line()}" for f in r.findings[:5]] + ([f"  - and {len(r.findings) - 5} more"] if len(r.findings) > 5 else [])
    for r in not_run:
        lines.append(f"- **{r.check}** did not run: {r.not_run}")
    rows = notify.board(ctx)
    if rows:
        gates = list(dict.fromkeys(g for row in rows for g in row["gates"]))
        lines += ["", "## Gates", "", "| Spec | " + " | ".join(gates) + " |", "|---|" + "---|" * len(gates)]
        for row in rows:
            lines.append(f"| {row['spec']} | " + " | ".join(row["gates"].get(g, "not needed") for g in gates) + " |")
    if events:
        lines += ["", "## What changed"] + [f"- {notify.title(e, templates)}" for e in events]
    if deliveries:
        lines += ["", "## Notifications"] + [f"- {d['event']} to {d['channel']}: {d['status']}" for d in deliveries]
    return "\n".join(lines) + "\n"


def mirror(ctx: Context, change: str, commit: str, write: bool = False) -> list[dict]:
    """Find reviews on `change` that carry an approval line for the current evidence of a gate, and mirror them.

    A gate is mirrored only when every role it needs is covered by an approving review from a person who holds that
    role, or when someone sent it back. Returns one row per gate looked at.
    """
    from agentic_kit.__main__ import _evidence_files, cmd_record, stated_reviews
    reviews = [r for r in adapters.enforcement(ctx).reviews(change) if r.account_type == "User"]
    rows = []
    for spec in ctx.specs():
        records = approved_records(ctx, spec)
        for gate in required_gates(ctx, spec):
            files = _evidence_files(ctx, spec, gate, None)
            if not files:
                continue
            digest = evidence_hash(ctx.src, spec, gate, files)
            if gate in records and (records[gate][1].get("evidence") or {}).get("hash") == digest:
                continue
            found = stated_reviews(ctx, spec, gate, change, digest, any_role=False, reviews=reviews)
            if not found["stated"]:
                continue
            decision, approvals, missing = found["decision"], found["approvals"], found["missing"]
            row = {"spec": spec, "gate": gate, "decision": decision, "missing": missing, "written": False,
                   "approvals": [f"{who}:{role}:{change}#{r.ref_suffix}" for who, role, r in approvals]}
            if not missing and write:
                args = argparse.Namespace(root=str(ctx.src.root), base_ref=ctx.trusted.ref, json=False, spec=spec, gate=gate, decision=decision,
                                          commit=commit, approval=row["approvals"], condition=None, exception=False, file=None)
                row["written"] = cmd_record(args) == 0
            rows.append(row)
    return rows
