"""Self-tests (TRC-17): every check has a passing fixture and a deliberately broken one.

Fixtures are built in code from one valid sample project. The passing fixture for a check is that
project; the failing fixture is the same project with one thing broken. `python agentic.py selftest`
materialises each into a temporary folder, runs the check, and reports whether the broken one failed.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Callable

import yaml

from . import checks_gov, checks_trace, lanes, reports  # noqa: F401  (registers the checks)
from .checks_trace import build_manifest
from .core import KIT_DIR, REGISTRY, Context, Result, Source, approval_line, audit_append, check, evidence_hash, run_check

TODAY = "2026-11-21"
SPEC = "001-demo"
COMMIT = "c0ffee1"
ROLE_IDS = ["product-owner", "solutions-architect", "backend", "frontend", "ai-engineer", "data-owner", "platform",
            "qa", "security-compliance", "devops-sre", "engineering-manager"]
GATE_PLAN = {  # gate -> (evidence files, [(reviewer, role)])
    "G1": (["spec.md"], [("alice", "product-owner")]),
    "G2": (["spec.md"], [("alice", "product-owner"), ("alice", "solutions-architect")]),
    "G3": (["plan.md", "impact.md"], [("alice", "solutions-architect")]),  # impact.md exists once the system extension is loaded
    "G4": (["tasks.md", "trace-manifest.json"], [("bob", "engineering-manager"), ("bob", "qa")]),
    "G5": (["trace-manifest.json", "evidence/junit.xml"], [("bob", "qa")]),
}

SPEC_MD = """---
spec: 001-demo
tier_declared: high
owner_role: backend
principles: [P-1]
paths: ["src/demo/*"]
---
# Feature Specification: Demo

## Requirements
- **FR-001**: System MUST greet the user by name.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a name, When greeted, Then the reply contains the name.

## Data Classification
Synthetic data only.
"""


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def _dump(root: Path, rel: str, data) -> None:
    _write(root, rel, yaml.safe_dump(data, sort_keys=False))


def context(root: Path, **options) -> Context:
    src = Source(root)
    return Context(src, src, {"today": TODAY, **options})


def build_sample(root: Path) -> None:
    """Write a small, fully valid Regulated project."""
    _write(root, ".specify/init-options.json", json.dumps({"speckit_version": "1.4.3"}))
    _write(root, ".specify/memory/constitution.md",
           "# Constitution\n\n### P-1 Every requirement is traced to a test\n\n### P-2 A human reviews every plan\n")
    _write(root, ".github/CODEOWNERS", "/.specify/ @alice\n")
    _write(root, ".github/workflows/ci.yml", "jobs:\n  build:\n    steps:\n      - run: make lint\n        continue-on-error: true\n")
    _write(root, "tests/demo.spec.ts", "test.skip('greets later', () => {});\n")
    _write(root, "src/demo/greet.py", "def greet(name):\n    return f'Hello {name}'\n")
    _dump(root, f"{KIT_DIR}/kit.yml", {
        "schema": "agentic-kit/1", "profile": "regulated", "domain_packs": ["demo"],
        "enforcement": {"adapter": "file", "default_branch": "main"}, "upstream": {"speckit": "1.4.3"},
        "gates": {"single_approver_exception": "allowed", "require_evidence_hash": True},
        "lanes": {"emergency": {"days": 7}},
        "metrics": [{"id": "lead-time-per-gate", "source": "audit-log"}]})
    _dump(root, f"{KIT_DIR}/packs/demo.yml", {"schema": "agentic-pack/1", "id": "demo", "required_sections": ["Data Classification"]})
    _dump(root, f"{KIT_DIR}/roles.yml", {
        "schema": "agentic-roles/1",
        "people": [{"id": "alice", "roles": ["product-owner", "solutions-architect"]},
                   {"id": "bob", "roles": ["qa", "engineering-manager", "security-compliance", "devops-sre"]}],
        "roles": {r: {"title": r} for r in ROLE_IDS}})
    _dump(root, f"{KIT_DIR}/constitution.map.yml", {
        "schema": "agentic-constitution-map/1",
        "principles": [{"id": "P-1", "title": "Traced", "enforcement": "machine", "checks": ["ck:CK-TRACE"]},
                       {"id": "P-2", "title": "Plan review", "enforcement": "human", "judged_at": "G3"}]})
    _dump(root, f"{KIT_DIR}/waivers/W-001.yml", {
        "schema": "agentic-waiver/1", "id": "W-001", "rule": "test-skip",
        "scope": {"paths": ["tests/demo.spec.ts"], "pattern": "test.skip("},
        "reason": "Feature is behind a flag", "compensating_control": "Manual check each release",
        "owner": "qa", "expires": "2099-01-01"})
    _dump(root, f"{KIT_DIR}/waivers/baseline.yml", {
        "schema": "agentic-baseline/1", "approved_by": {"reviewer": "alice", "review_ref": "pull/1#review-1"},
        "groups": [{"rule": "ci-escape", "count": 1, "owner": "devops-sre", "reason": "Existing at adoption",
                    "expires": "2099-01-01"}]})
    base = f"specs/{SPEC}"
    _write(root, f"{base}/spec.md", SPEC_MD)
    _write(root, f"{base}/plan.md", "# Plan\n\nOne function in src/demo.\n")
    _write(root, f"{base}/tasks.md", "# Tasks\n\n- [x] T001 Implement greet. Carries: AC-001\n")
    _write(root, f"{base}/evidence/junit.xml",
           '<testsuite><testcase classname="demo" name="test_AC_001_reply_contains_name"/></testsuite>\n')
    _dump(root, f"{base}/verification/G6-inputs.yml", {
        "verifier": "independent-verifier", "author": "backend-implementer",
        "inputs": [f"{base}/spec.md", ".specify/memory/constitution.md", "src/demo/greet.py"]})
    from .core import SAMPLE_HOOKS
    for hook in SAMPLE_HOOKS:
        hook(root)
    ctx = context(root)
    _write(root, f"{base}/trace-manifest.json", json.dumps(build_manifest(ctx, SPEC), indent=2) + "\n")
    from .checks_gov import gate_roles, people_by_role
    holders = people_by_role(ctx.roles())
    reviews, n = [], 0
    for gate, (files, planned) in GATE_PLAN.items():
        # Sibling extensions may require more roles (for example the owner of a touched node).
        approvals = list(planned)
        for role in gate_roles(ctx, gate, SPEC):
            if role not in [r for _, r in approvals]:
                approvals.append((sorted(holders[role])[0], role))
        paths = [f"{base}/{f}" for f in files if (root / base / f).exists()]
        _write(root, lanes.brief_path(SPEC, gate), lanes.build_brief(ctx, SPEC, gate, paths))  # the reviewer's one page, bound with the rest
        paths.append(lanes.brief_path(SPEC, gate))
        digest = evidence_hash(ctx.src, SPEC, gate, paths)
        entry = audit_append(root, SPEC, {"type": "kit", "id": "selftest"}, "gate.evidence", spec=SPEC, gate=gate, commit=COMMIT)
        recorded = []
        for reviewer in dict.fromkeys(r for r, _ in approvals):
            n += 1
            reviews.append({"id": str(n), "reviewer": reviewer, "type": "User", "state": "APPROVED", "commit": COMMIT,
                            "body": "Looks right.\n" + approval_line(gate, "approve", digest)})
            recorded += [{"reviewer": reviewer, "role": role, "review_ref": f"pull/1#review-{n}"}
                         for r, role in approvals if r == reviewer]
        _dump(root, f"{KIT_DIR}/decisions/{SPEC}/{gate}.yml", {
            "schema": "agentic-decision/1", "spec": SPEC, "gate": gate, "decision": "approve", "commit": COMMIT,
            "evidence": {"hash": digest, "files": paths}, "approvals": recorded,
            "single_approver_exception": False, "audit_head": entry["hash"]})
    n += 1
    reviews.append({"id": str(n), "reviewer": "bob", "type": "User", "state": "APPROVED", "commit": COMMIT,
                    "body": "Emergency E-001: approve the fix now; retrospective to follow."})
    _dump(root, f"{lanes.EMERGENCIES}/E-001.yml", {
        "schema": "agentic-emergency/1", "id": "E-001", "summary": "Restart loop after a bad configuration push",
        "declared": "2026-11-20", "declared_by": {"reviewer": "bob", "role": "devops-sre", "review_ref": f"pull/1#review-{n}"},
        "commit": COMMIT, "paths": ["ops/*"], "retrospective": {"spec": SPEC, "due": "2026-11-27"}, "status": "open"})
    _write(root, f"{KIT_DIR}/_adapter/reviews.json", json.dumps(
        {"agent_identity": "kit-agent", "ci_identity": "ci-bot",
         "agent_credential": {"identity": "kit-agent", "permissions": {"admin": False, "maintain": False, "push": True, "pull": True},
                              "scopes": []},
         "setup": [{"item": "pull request reviews required", "status": "pass", "detail": "simulated"}],
         "changes": {"pull/1": {"authors": ["carol"], "reviews": reviews}}}, indent=2))


def _edit(rel: str, old: str, new: str) -> Callable[[Path], None]:
    def go(root: Path) -> None:
        path = root / rel
        text = path.read_text(encoding="utf-8")
        assert old in text, f"selftest fixture is stale: {old!r} not in {rel}"
        path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
    return go


def _edit_json(rel: str, fn: Callable[[dict], None]) -> Callable[[Path], None]:
    def go(root: Path) -> None:
        path = root / rel
        data = json.loads(path.read_text(encoding="utf-8"))
        fn(data)
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return go


def _many(*steps: Callable[[Path], None]) -> Callable[[Path], None]:
    return lambda root: [s(root) for s in steps] and None


def _alter_audit(root: Path) -> None:
    path = root / f"{KIT_DIR}/audit/{SPEC}.jsonl"
    path.write_text(path.read_text(encoding="utf-8").replace('"gate.evidence"', '"gate.evidence.edited"', 1), encoding="utf-8")


def _author_is_reviewer(data: dict) -> None:
    data["changes"]["pull/1"]["authors"].append("alice")


def _drop_line(data: dict) -> None:
    data["changes"]["pull/1"]["reviews"][0]["body"] = "Looks right."


KIT = f"{KIT_DIR}/kit.yml"
SPECFILE = f"specs/{SPEC}/spec.md"

#: check id -> (what is broken, mutation, options for the pass run, options for the fail run)
FIXTURES: dict[str, tuple[str, Callable[[Path], None], dict, dict]] = {
    "CK-PROFILE": ("kit.yml names an unknown profile", _edit(KIT, "profile: regulated", "profile: strict"), {}, {}),
    "CK-ROLES": ("nobody holds the QA role a gate requires", _edit(f"{KIT_DIR}/roles.yml", "  - qa\n", ""), {}, {}),
    "CK-UPSTREAM-PIN": ("installed Spec Kit differs from the pin", _edit(".specify/init-options.json", "1.4.3", "1.3.0"), {}, {}),
    "CK-ENFORCE-SETUP": ("CODEOWNERS does not cover roles.yml", _edit(".github/CODEOWNERS", "/.specify/ @alice", "/docs/ @alice"), {}, {}),
    "CK-TIER": ("a spec declares no tier", _edit(SPECFILE, "tier_declared: high\n", ""), {}, {}),
    "CK-CONSTITUTION": ("a machine-enforced principle names no check",
                        _edit(f"{KIT_DIR}/constitution.map.yml", "  checks:\n  - ck:CK-TRACE\n", "  checks: []\n"), {}, {}),
    "CK-GATE-RECORD": ("evidence changed after it was approved", _edit(f"specs/{SPEC}/plan.md", "One function", "Two functions"), {}, {}),
    "CK-APPROVER": ("the reviewer authored the change and exceptions are forbidden",
                    _many(_edit_json(f"{KIT_DIR}/_adapter/reviews.json", _author_is_reviewer),
                          _edit(KIT, "single_approver_exception: allowed", "single_approver_exception: forbidden")), {}, {}),
    "CK-GATE-MIRROR": ("a review does not state the decision it is recorded as",
                       _edit_json(f"{KIT_DIR}/_adapter/reviews.json", _drop_line), {}, {}),
    "CK-WAIVER": ("a new skipped test has no waiver",
                  lambda root: _write(root, "tests/new.spec.ts", "it.skip('later', () => {});\n"), {}, {}),
    "CK-TRACE": ("an acceptance criterion has no test and no open task",
                 _edit(SPECFILE, "## Data Classification", "- **AC-002** (verifies FR-001): Given no name, Then it fails.\n\n## Data Classification"), {}, {}),
    "CK-TRACE-GENERATED": ("the trace manifest was edited by hand",
                           _edit(f"specs/{SPEC}/trace-manifest.json", '"proven"', '"waived"'), {}, {}),
    "CK-AUDIT-CHAIN": ("an audit entry was altered", _alter_audit, {}, {}),
    "CK-DRIFT-SPEC": ("code under an approved spec changed with no spec", lambda root: None,
                      {"changed_files": ["src/demo/greet.py", SPECFILE]}, {"changed_files": ["src/demo/greet.py"]}),
    "CK-METRIC-SOURCE": ("a metric has no data source", _edit(KIT, "source: audit-log", "source: guess"), {}, {}),
    "CK-VERIFY-INPUTS": ("the verifier was given the author's notes",
                         _edit(f"specs/{SPEC}/verification/G6-inputs.yml", "- src/demo/greet.py", f"- specs/{SPEC}/notes/author.md"), {}, {}),
    "CK-LANE": ("the author put the spec on the fast lane by hand", _edit(SPECFILE, "tier_declared: high\n", "tier_declared: high\nlane: fast\n"), {}, {}),
    "CK-EMERGENCY-DEADLINE": ("an emergency change's retrospective is overdue", lambda root: None, {}, {"today": "2026-12-15"}),
    "CK-AMENDMENT": ("the plan changed after G3 approved it", lambda root: None, {},
                     {"approved_files": {f"specs/{SPEC}/plan.md": "# Plan\n\nA different plan was approved.\n"}}),
    "CK-BRIEF": ("a gate was decided without the reviewer brief in its evidence",
                 _edit(f"{KIT_DIR}/decisions/{SPEC}/G3.yml", f"  - specs/{SPEC}/briefs/G3.md\n", ""), {}, {}),
    "CK-AUDIT-PACK": ("a release was approved with no evidence pack",
                      lambda root: _dump(root, f"{KIT_DIR}/decisions/{SPEC}/G7.yml", {"schema": "agentic-decision/1", "spec": SPEC, "gate": "G7",
                                                                                      "decision": "approve", "evidence": {"hash": "sha256:0", "files": []}}), {}, {}),
    "CK-DOMAIN-SECTIONS": ("a section the domain pack requires is missing",
                           _edit(SPECFILE, "## Data Classification\nSynthetic data only.\n", ""), {}, {}),
}


def all_fixtures() -> dict:
    from .core import FIXTURE_HOOKS
    merged = dict(FIXTURES)
    for hook in FIXTURE_HOOKS:
        merged.update(hook())
    return merged


@check("CK-SELFTEST", ("TRC-17",), "every check has a passing and a failing fixture")
def ck_selftest(ctx: Context, res: Result) -> None:
    fixtures = ctx.options.get("fixtures", all_fixtures())
    for cid in sorted(REGISTRY):
        if cid != "CK-SELFTEST" and cid not in fixtures:
            res.fail(f"{cid} has no fixtures")


def run_selftest() -> tuple[bool, list[dict]]:
    """Run every fixture. Returns (all good, rows)."""
    rows, good = [], True
    FIXTURES = all_fixtures()  # noqa: N806 - shadows the core table with the merged one
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "base"
        build_sample(base)
        whole = [run_check(cid, context(base, **FIXTURES.get(cid, ("", None, {}, {}))[2])) for cid in sorted(REGISTRY)]
        for r in whole:
            if not r.ok:
                good = False
                rows.append({"check": r.check, "fixture": "sample project", "expected": "pass",
                             "actual": "not run" if r.not_run else "fail", "detail": r.not_run or r.findings[0].line()})
        for cid in sorted(REGISTRY):
            if cid == "CK-SELFTEST":
                broken = {k: v for k, v in FIXTURES.items() if k != "CK-TRACE"}
                r = run_check(cid, context(base, fixtures=broken))
                ok = bool(r.findings)
                rows.append({"check": cid, "fixture": "a check with no fixtures", "expected": "fail",
                             "actual": "fail" if ok else "pass", "detail": r.findings[0].line() if ok else ""})
                good &= ok
                continue
            if cid not in FIXTURES:
                good = False
                rows.append({"check": cid, "fixture": "(none)", "expected": "fail", "actual": "missing", "detail": ""})
                continue
            what, mutate, _, fail_opts = FIXTURES[cid]
            root = Path(tmp) / cid
            build_sample(root)
            mutate(root)
            r = run_check(cid, context(root, **fail_opts))
            ok = bool(r.findings) and r.not_run is None
            rows.append({"check": cid, "fixture": what, "expected": "fail",
                         "actual": "fail" if ok else ("not run" if r.not_run else "pass"),
                         "detail": r.findings[0].line() if r.findings else (r.not_run or "")})
            good &= ok
    return good, rows
