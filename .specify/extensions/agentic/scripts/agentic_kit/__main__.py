"""Command line for the kit. Every command works without an agent.

Exit codes: 0 all good, 1 a check failed, 2 a check could not run or the command was misused.
Run as a program, 141 when whatever was reading the output stopped before the end (`... | head`).
"""
from __future__ import annotations

import argparse
import errno
import io
import json
import os
import shutil
import subprocess
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import yaml

from . import __version__, adapters, checks_gov, checks_trace, reports, selftest  # noqa: F401
from .checks_gov import DEFAULT_APPROVERS, decisions, gate_roles
from .checks_trace import build_manifest
from .core import (DECISIONS, GATES, KIT_DIR, PROFILE_GATES, PROFILES, REGISTRY, Context, KitError, Source,
                   approval_line, audit_append, evidence_hash, parse_approval_lines, run_check)

DEFAULT_EVIDENCE = {
    "G1": ["spec.md"], "G2": ["spec.md"], "G3": ["plan.md", "impact.md", "data-change-plan.md"],
    "G4": ["tasks.md", "trace-manifest.json"], "G5": ["trace-manifest.json", "evidence/*"],
    "G6": ["verification/*"], "G7": ["release/*"],
}
for _gate in list(DEFAULT_EVIDENCE):  # every gate also binds its reviewer brief, when one has been generated (GOV-20)
    DEFAULT_EVIDENCE[_gate].append(f"briefs/{_gate}.md")
    # ... and what a reviewing agent wrote for that gate (reviews/G5-security.md), so a decision is made on the findings too
    DEFAULT_EVIDENCE[_gate].append(f"reviews/{_gate}-*")
DOCTOR_CHECKS = ["CK-PROFILE", "CK-ROLES", "CK-UPSTREAM-PIN", "CK-ENFORCE-SETUP"]
BRANCH_HELP = ("the branch these files are from, as a name or a full ref (main, refs/heads/main, refs/pull/7/merge). On the default "
               "branch the gate check also asks for the gates before a merge. Without this, git is asked, and the check says so in a "
               "note when git cannot tell. Give it where git cannot: an exported tree, a shallow clone, a folder of another repository")


def _context(args) -> Context:
    src = Source(args.root)
    trusted = src.at(args.base_ref) if getattr(args, "base_ref", None) else src
    options = {}
    if getattr(args, "today", None):
        options["today"] = args.today
    if getattr(args, "changed_files", None):
        options["changed_files"] = [x.strip() for x in Path(args.changed_files).read_text().splitlines() if x.strip()]
    if getattr(args, "branch", None):
        options["branch"] = args.branch
    return Context(src, trusted, options)


def _report(results, as_json: bool) -> int:
    failed = [r for r in results if r.findings]
    not_run = [r for r in results if r.not_run]
    if as_json:
        print(json.dumps({"ok": not failed and not not_run, "results": [r.as_dict() for r in results]}, indent=2))
    else:
        for r in results:
            status = "NOT RUN" if r.not_run else ("FAIL" if r.findings else "ok")
            print(f"{status:8} {r.check}")
            if r.not_run:
                print(f"         {r.not_run}")
            for f in r.findings:
                print(f"         {f.line()}")
            for n in r.notes:
                print(f"         note: {n}")
        print(f"\n{len(results) - len(failed) - len(not_run)} passed, {len(failed)} failed, {len(not_run)} not run")
    return 1 if failed else (2 if not_run else 0)


def cmd_check(args) -> int:
    ctx = _context(args)
    ids = args.ids or [c for c in sorted(REGISTRY) if c != "CK-SELFTEST"]
    unknown = [i for i in ids if i not in REGISTRY]
    if unknown:
        print(f"unknown check(s): {', '.join(unknown)}", file=sys.stderr)
        return 2
    results = [run_check(i, ctx) for i in ids]
    code = _report(results, args.json)
    # A check that cannot run is a warning in Lite and a failure otherwise (docs/design/checks.md).
    try:
        lite = ctx.profile == "lite"
    except KitError:
        lite = False
    return 0 if code == 2 and lite else code


def cmd_doctor(args) -> int:
    ctx = _context(args)
    results = [run_check(i, ctx) for i in DOCTOR_CHECKS]
    code = _report(results, args.json)
    if not args.json:
        try:
            adapter = (ctx.kit().get("enforcement") or {}).get("adapter")
        except KitError:
            adapter = None
        print("\nWhat this means:")
        if adapter == "file":
            print("  - The file adapter is configured. Approvals are NOT bound to any identity. Use it for tests only.")
        if any(r.findings for r in results if r.check == "CK-ENFORCE-SETUP"):
            print("  - Until the items above are fixed, approver rules (GOV-6, GOV-7, GOV-16) are convention, not enforcement.")
        print("  - Identity binding protects only while the agent cannot use an approver's credentials.")
    return code


CONSTITUTION_EVIDENCE = [".specify/memory/constitution.md", f"{KIT_DIR}/constitution.map.yml"]


def _names(root: Path, given: str, rel: str) -> bool:
    """Does a path that was given by hand name this file of the repository, however it is written?"""
    if str(given).replace("\\", "/").lstrip("./") == rel:
        return True
    try:
        return (root / str(given)).resolve() == (root / rel).resolve()
    except (OSError, ValueError):
        return False


def _evidence_files(ctx: Context, spec: str, gate: str, explicit: list[str] | None) -> list[str]:
    base = f"specs/{spec}"
    from .changeset import page_path  # the page of a change is generated: it is never evidence, whatever a pattern says (CHS-9)
    page = page_path(spec)
    if explicit:
        if any(_names(ctx.src.root, f, page) for f in explicit):
            raise KitError(f"{page} is the generated page of the change. It is never gate evidence: writing it again would open the gate")
        return sorted(explicit)
    import fnmatch
    if gate == "G0":
        version = (ctx.src.yaml(CONSTITUTION_EVIDENCE[1]) or {}).get("version") if ctx.src.exists(CONSTITUTION_EVIDENCE[1]) else None
        report = f"{KIT_DIR}/constitution/amendment-v{version}.md"
        return sorted(f for f in CONSTITUTION_EVIDENCE + [report] if ctx.src.exists(f))
    from .checks_gov import FAST_MERGED, lane
    patterns = list(DEFAULT_EVIDENCE.get(gate, []))
    if gate == "G4" and lane(ctx, spec) == "fast":  # the fast lane's one review covers what G1 to G3 would have
        for merged in FAST_MERGED:
            patterns += [p for p in DEFAULT_EVIDENCE.get(merged, []) if p not in patterns]
    present = ctx.src.files(base)
    out = []
    for pat in patterns:
        out += [p for p in present if fnmatch.fnmatch(p, f"{base}/{pat}")]
    return sorted(set(out) - {page})


def _uncommitted(root: Path, files: list[str]) -> list[str] | None:
    """Which of these files git does not hold as they are now: new, changed or only staged. None where git cannot say (REC-7)."""
    try:
        done = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all", "--", *files],
                              capture_output=True, text=True)
    except OSError:
        return None
    if done.returncode:
        return None
    changed = [line[3:].split(" -> ")[-1].strip().strip('"') for line in done.stdout.splitlines() if line.strip()]
    return [f for f in files if any(path == f or path.endswith("/" + f) for path in changed)]  # git names paths from its own root


def cmd_gate(args) -> int:
    ctx = _context(args)
    if args.gate not in GATES:
        print(f"{args.gate} is not a gate", file=sys.stderr)
        return 2
    from .checks_gov import lane, required_gates
    spec_lane = lane(ctx, args.spec)
    if args.gate != "G0" and args.gate not in required_gates(ctx, args.spec):
        why = (f"{args.gate} is folded into G4 on the fast lane" if spec_lane == "fast"
               else f"{args.gate} is not required by the {ctx.profile} profile")
        if args.json:
            print(json.dumps({"spec": args.spec, "gate": args.gate, "required": False, "lane": spec_lane, "status": why}, indent=2))
        else:
            print(f"Gate {args.gate} for {args.spec}: {why}")
        return 0
    files = _evidence_files(ctx, args.spec, args.gate, args.file)
    if not files:
        print(f"no evidence files found for {args.gate} of {args.spec}", file=sys.stderr)
        return 2
    digest = evidence_hash(ctx.src, args.spec, args.gate, files)
    rel = f"{KIT_DIR}/decisions/{args.spec}/{args.gate}.yml"
    record = ctx.src.yaml(rel) if ctx.src.exists(rel) else None
    state = "no decision recorded"
    if record:
        same = (record.get("evidence") or {}).get("hash") == digest
        state = f"{record.get('decision')} recorded" + ("" if same else " for DIFFERENT evidence (the files changed since)")
    info = {"spec": args.spec, "gate": args.gate, "evidence": files, "hash": digest, "status": state,
            "approved": bool(record and record.get("decision") in ("approve", "approve-with-conditions")
                             and (record.get("evidence") or {}).get("hash") == digest),
            "required_roles": gate_roles(ctx, args.gate, args.spec), "required": True, "lane": spec_lane,
            "paste": approval_line(args.gate, "approve", digest)}
    info["uncommitted"] = _uncommitted(ctx.src.root, files)
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        print(f"Gate {args.gate} for {args.spec}: {state}")
        print("Evidence:")
        for f in files:
            print(f"  {f}")
        print(f"Roles that must approve: {', '.join(info['required_roles'])}")
        print("\nTo approve, a person holding the role submits an approving review containing this line:\n")
        print(f"  {info['paste']}\n")
        print("To reject, request changes with `reject` in place of `approve`.")
        if info["uncommitted"]:
            print("\nNot committed:")
            for f in info["uncommitted"]:
                print(f"  {f}")
            print("A reviewer sees only what is committed and pushed. The line above is for the files as they are on disk now.")
    return 0


REVIEW_STATES = {"approve": "APPROVED", "approve-with-conditions": "APPROVED", "reject": "CHANGES_REQUESTED"}


def stated_reviews(ctx: Context, spec: str, gate: str, change: str, digest: str, any_role: bool | None = None, reviews=None) -> dict:
    """What the reviews on `change` say about one gate, for the evidence whose hash is `digest` (REC-1, REC-2).

    Only reviews by a person are read, and of those only the ones that carry the gate's line for that evidence, in the
    review state the line's decision asks for. Nothing is judged here: CK-APPROVER and CK-GATE-MIRROR read the reviews again.
    `any_role`: one needed role is enough. Left out, that is so in Lite, as it is for CK-APPROVER."""
    from .checks_gov import people_by_role
    if any_role is None:
        any_role = ctx.profile == "lite"
    if reviews is None:
        reviews = [r for r in adapters.enforcement(ctx).reviews(change) if r.account_type == "User"]
    stated = [(r, decision) for r in reviews for g, decision, d in parse_approval_lines(r.body)
              if g == gate and d == digest and r.state == REVIEW_STATES[decision]]
    holders = people_by_role(ctx.roles())
    needed = gate_roles(ctx, gate, spec)
    rejecting = [r for r, decision in stated if decision == "reject"]
    if rejecting:
        decision = "reject"
        approvals = [(r.reviewer, role, r) for r in rejecting for role in needed if r.reviewer.lower() in holders.get(role, set())]
        missing = [] if approvals else list(needed)
    else:
        decision = "approve-with-conditions" if any(d == "approve-with-conditions" for _, d in stated) else "approve"
        approvals, missing = [], []
        for role in needed:
            who = next((r for r, _ in stated if r.reviewer.lower() in holders.get(role, set())), None)
            if who is None:
                missing.append(role)
            else:
                approvals.append((who.reviewer, role, who))
        if any_role and approvals:
            missing = []
    return {"stated": stated, "decision": decision if stated else None, "approvals": approvals, "missing": missing, "needed": list(needed)}


def _from_reviews(ctx: Context, args, digest: str) -> tuple | str:
    """For `record --change`: the decision, the commit and the approvals that the reviews give, or the reason nothing can be recorded (REC-3)."""
    found = stated_reviews(ctx, args.spec, args.gate, args.change, digest)
    if not found["stated"]:
        return (f"no review on {args.change} carries the line for {args.gate} of {args.spec} as its evidence stands now.\n"
                f"The line is:\n\n  {approval_line(args.gate, 'approve', digest)}\n\n"
                "It has to stand on a line of its own, in an approving review by a person; `reject` in its place, in a review that requests changes.")
    carriers = ", ".join(sorted({r.reviewer for r, _ in found["stated"]}))
    if found["missing"]:
        return (f"the line is carried by a review of {carriers}, but {args.gate} still needs "
                f"{'one of' if ctx.profile == 'lite' else 'each of'}: {', '.join(found['missing'])}. "
                "A reviewer has to hold the role in roles.yml on the base branch.")
    used = {r.id: r for _, _, r in found["approvals"]}
    commits = sorted({r.commit for r in used.values()})
    if len(commits) != 1 or not commits[0]:
        return f"the reviews that carry the line are not on one commit ({', '.join(c[:12] or 'none' for c in commits)}), and a decision names one"
    decision, commit = found["decision"], commits[0]
    if args.decision and args.decision != decision:
        return f"--decision says {args.decision}, and the review says {decision}"
    if args.commit and not (commit.startswith(args.commit) or args.commit.startswith(commit)):
        return f"--commit says {args.commit}, and the review is on {commit[:12]}"
    if decision == "approve-with-conditions" and not args.condition:
        return "the review approves with conditions: give each one with --condition"
    for r in used.values():
        print(f"found on {args.change}: review {r.id} by {r.reviewer}, {r.state}, on {r.commit[:12]}")
    try:
        authors = adapters.enforcement(ctx).authors(args.change)
    except KitError:
        authors = set()
    for who in sorted({r.reviewer for r in used.values() if r.reviewer.lower() in authors}):
        if not args.exception:
            print(f"note: {who} also wrote this change. Where the project allows a single-approver exception, give --exception as well.")
    return decision, args.commit or commit, [f"{who}:{role}:{args.change}#{r.ref_suffix}" for who, role, r in found["approvals"]]


def cmd_record(args) -> int:
    """Mirror a review that already exists into a decision record. Does not create approval."""
    ctx = _context(args)
    files = _evidence_files(ctx, args.spec, args.gate, args.file)
    digest = evidence_hash(ctx.src, args.spec, args.gate, files)
    if getattr(args, "change", None):  # a caller that builds its own arguments, as `connect mirror` does, gives the long form
        if args.approval:
            print("give --change or --approval, not both", file=sys.stderr)
            return 2
        found = _from_reviews(ctx, args, digest)
        if isinstance(found, str):
            print(f"{found}\nNothing was recorded.", file=sys.stderr)
            return 2
        args.decision, args.commit, args.approval = found
    elif not (args.decision and args.commit and args.approval):
        print("give --change pull/<n>, or all three of --decision, --commit and --approval", file=sys.stderr)
        return 2
    if args.decision not in DECISIONS:
        print(f"decision must be one of {', '.join(DECISIONS)}", file=sys.stderr)
        return 2
    approvals = []
    for item in args.approval:
        try:
            reviewer, role, ref = item.split(":", 2)
        except ValueError:
            print("--approval must be reviewer:role:pull/<n>#review-<id>", file=sys.stderr)
            return 2
        approvals.append({"reviewer": reviewer, "role": role, "review_ref": ref})
    entry = audit_append(ctx.src.root, args.spec, {"type": "kit", "id": "record"}, "gate.decision",
                         spec=args.spec, gate=args.gate, decision=args.decision, commit=args.commit, evidence=digest)
    record = {"schema": "agentic-decision/1", "spec": args.spec, "gate": args.gate, "decision": args.decision,
              "commit": args.commit, "evidence": {"hash": digest, "files": files}, "approvals": approvals,
              "single_approver_exception": bool(args.exception), "audit_head": entry["hash"]}
    from .checks_gov import lane
    if lane(ctx, args.spec) == "fast":
        record["lane"] = "fast"
    if args.gate == "G0" and ctx.src.exists(CONSTITUTION_EVIDENCE[1]):
        record["constitution_version"] = (ctx.src.yaml(CONSTITUTION_EVIDENCE[1]) or {}).get("version")
    if args.condition:
        record["conditions"] = args.condition
    path = ctx.src.root / KIT_DIR / "decisions" / args.spec / f"{args.gate}.yml"
    if path.is_file():  # a gate decided again (an amendment re-opened it): keep what the earlier decision was
        old = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        record["superseded"] = list(old.get("superseded") or []) + [{
            "decision": old.get("decision"), "commit": old.get("commit"), "hash": (old.get("evidence") or {}).get("hash"),
            "approvals": old.get("approvals") or []}]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(record, sort_keys=False), encoding="utf-8", newline="\n")
    print(f"wrote {path.relative_to(ctx.src.root).as_posix()}")
    print("This is a mirror. CK-APPROVER and CK-GATE-MIRROR decide whether the review behind it is valid.")
    return 0


from . import decision_log  # noqa: E402  (here, with its command: registers CK-DECISION-LOG, its fixtures and its two views)

# The person who approves the implementation approves the decisions it rests on. A spec with no log has the evidence it had (DEC-8, DEC-9).
DEFAULT_EVIDENCE[decision_log.GATE].append(decision_log.LOG_NAME)


def cmd_decision(args) -> int:
    """The decision log of one change: add a question, record what a person decided, list. Writing an entry approves nothing (DEC-7)."""
    return decision_log.command(_context(args), args)


def cmd_brief(args) -> int:
    from . import lanes
    ctx = _context(args)
    try:
        text = lanes.build_brief(ctx, args.spec, args.gate)
    except KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if args.write:
        path = ctx.src.root / lanes.brief_path(args.spec, args.gate)
        if path.is_file() and path.read_text(encoding="utf-8") == text:
            # Nothing changed for the reviewer, so the gate was already ready: no second entry in the audit log.
            print(f"unchanged {lanes.brief_path(args.spec, args.gate)}")
            return 0
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        # The moment a gate is ready for a person: time-to-decision is counted from here (TRC-13).
        audit_append(ctx.src.root, args.spec, {"type": "kit", "id": "brief"}, "gate.ready", spec=args.spec, gate=args.gate)
        print(f"wrote {lanes.brief_path(args.spec, args.gate)}")
    else:
        print(text)
    return 0


def cmd_report(args) -> int:
    ctx = _context(args)
    available = reports.views()
    if args.view == "list":
        print("\n".join(sorted(available)))
        return 0
    if args.view == "all":
        rendered = reports.render_all(ctx)
        if not args.out:
            print("\n".join(rendered.values()))
            return 0
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        for name, text in rendered.items():
            (out / f"{name}.md").write_text(text, encoding="utf-8", newline="\n")
        if args.html:
            (out / "index.html").write_text(reports.page(ctx, rendered), encoding="utf-8", newline="\n")
        print(f"wrote {len(rendered)} view(s) to {out}" + (" and index.html" if args.html else ""))
        return 0
    if args.view not in available:
        print(f"unknown view {args.view!r}; choose from {', '.join(sorted(available))}, or all", file=sys.stderr)
        return 2
    text = reports.view_trace(ctx, args.spec) if args.view == "trace" and args.spec else available[args.view](ctx)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


def cmd_audit_pack(args) -> int:
    from .checks_gov import as_date
    ctx = _context(args)
    scope = {}
    if args.spec:
        if args.spec not in ctx.specs():
            print(f"spec {args.spec} does not exist", file=sys.stderr)
            return 2
        specs = [args.spec]
    elif args.date_from or args.date_to:
        start, end = as_date(args.date_from) if args.date_from else None, as_date(args.date_to) if args.date_to else None
        if (args.date_from and start is None) or (args.date_to and end is None):
            print("--from and --to are dates, as YYYY-MM-DD", file=sys.stderr)
            return 2
        specs = reports.specs_in_range(ctx, start, end)
        scope = {"from": args.date_from, "to": args.date_to}
    else:
        specs = ctx.specs()
    manifest, files = reports.build_pack(ctx, specs, scope)
    if args.out:
        reports.write_pack(Path(args.out), manifest, files)
        print(f"wrote {len(files) + 1} file(s) to {args.out}")
    if args.write:
        for spec in specs:
            own = manifest if len(specs) == 1 else reports.build_pack(ctx, [spec], scope)[0]
            rel = f"specs/{spec}/{reports.PACK_FILE}"
            path = ctx.src.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(reports.spec_pack(own), indent=2, default=str) + "\n", encoding="utf-8", newline="\n")
            print(f"wrote {rel}")
    if not args.out and not args.write:
        print(json.dumps(reports.spec_pack(manifest), indent=2, default=str))
    print(reports.STATEMENT, file=sys.stderr)
    return 0


def cmd_amend(args) -> int:
    from . import lanes
    ctx = _context(args)
    try:
        if args.action == "report":
            rel, text = lanes.amendment_report(ctx)
            if args.write:
                path = ctx.src.root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8", newline="\n")
                print(f"wrote {rel}")
            else:
                print(text)
            return 0
        specs = [args.spec] if args.spec else ctx.specs()
        rows = {s: lanes.reopened(ctx, s)[0] for s in specs}
    except KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        for spec, gates in rows.items():
            if not gates:
                print(f"{spec}: nothing approved has changed")
            for gate, why in sorted(gates.items()):
                print(f"{spec}: {gate} is re-opened ({'; '.join(why)})")
    return 1 if any(rows.values()) else 0


def cmd_lane(args) -> int:
    from .checks_gov import lane, required_gates
    ctx = _context(args)
    for spec in ([args.spec] if args.spec else ctx.specs()):
        print(f"{spec}: {lane(ctx, spec)} lane; gates {', '.join(required_gates(ctx, spec))}")
    return 0


def cmd_trace(args) -> int:
    ctx = _context(args)
    specs = [args.spec] if args.spec else ctx.specs()
    bad = False
    for spec in specs:
        manifest = build_manifest(ctx, spec)
        bad |= not manifest["gate"]["ok"]
        if args.write:
            path = ctx.src.root / "specs" / spec / "trace-manifest.json"
            path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
            print(f"wrote specs/{spec}/trace-manifest.json")
        if args.json:
            print(json.dumps(manifest, indent=2))
        else:
            print(f"\n{spec}")
            print("| Requirement | Criterion | Tasks | Tests | State |")
            print("|---|---|---|---|---|")
            for r in manifest["rows"]:
                print(f"| {r['requirement']} | {r['criterion']} | {', '.join(r['tasks']) or '-'} | {len(r['tests'])} | {r['state']} |")
            for f in manifest["gate"]["failures"]:
                print(f"  FAIL {f}")
    return 1 if bad else 0


def cmd_suppressions(args) -> int:
    ctx = _context(args)
    found = adapters.find_suppressions(ctx)
    counts: dict[str, int] = {}
    for s in found:
        counts[s["rule"]] = counts.get(s["rule"], 0) + 1
    if args.baseline:
        doc = {"schema": "agentic-baseline/1", "approved_by": {"reviewer": "", "review_ref": ""},
               "groups": [{"rule": r, "count": n, "owner": "", "reason": "Existing at adoption", "expires": ""}
                          for r, n in sorted(counts.items())]}
        print(yaml.safe_dump(doc, sort_keys=False))
        print("# Fill in owner and expiry for each group, get it approved at a gate, then save it as "
              f"{KIT_DIR}/waivers/baseline.yml", file=sys.stderr)
    elif args.json:
        print(json.dumps(found, indent=2))
    else:
        for s in found:
            print(f"{s['rule']:18} {s['path']}:{s['line']}  {s['text']}")
        print("\n" + ", ".join(f"{r}: {n}" for r, n in sorted(counts.items())) if counts else "no suppressions found")
    return 0


def cmd_init(args) -> int:
    root = Path(args.root).resolve()
    if args.profile not in PROFILES:
        print(f"profile must be one of {', '.join(PROFILES)}", file=sys.stderr)
        return 2
    templates = Path(__file__).resolve().parents[2] / "templates"
    kit_dir = root / KIT_DIR
    kit_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name in ("kit.yml", "roles.yml", "constitution.map.yml"):
        dest = kit_dir / name
        if dest.exists() and not args.force:
            continue
        text = (templates / name).read_text(encoding="utf-8")
        if name == "kit.yml":
            text = text.replace("__PROFILE__", args.profile).replace("__REPOSITORY__", args.repository or "owner/name")
            packs = ", ".join(args.pack or [])
            text = text.replace("__PACKS__", packs)
            text = text.replace("__HASH__", "false" if args.profile == "lite" else "true")
        dest.write_text(text, encoding="utf-8", newline="\n")
        written.append(dest)
    for pack in args.pack or []:
        source = root / ".specify" / "extensions" / f"agentic-{pack}" / "pack.yml"
        if not source.exists():
            print(f"domain pack {pack} is not installed (expected {source.relative_to(root).as_posix()})", file=sys.stderr)
            return 2
        dest = kit_dir / "packs" / f"{pack}.yml"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        written.append(dest)
    ci = root / ".github" / "workflows" / "agentic-checks.yml"
    source = Path(__file__).resolve().parents[2] / "ci" / "agentic-checks.yml"
    if source.exists() and (not ci.exists() or args.force):
        ci.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, ci)
        written.append(ci)
    if getattr(args, "open_pr_workflow", False):  # for the person who pushes a branch and also approves its gate (BOT-4)
        opener = root / ".github" / "workflows" / "agentic-open-pull-request.yml"
        source = Path(__file__).resolve().parents[2] / "ci" / "agentic-open-pull-request.yml"
        if source.exists() and (not opener.exists() or args.force):
            opener.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, opener)
            written.append(opener)
    if not (kit_dir / "audit" / "kit.jsonl").exists():
        audit_append(root, "kit", {"type": "kit", "id": "init"}, "kit.init", profile=args.profile)
        written.append(kit_dir / "audit" / "kit.jsonl")
    for p in written:
        print(f"wrote {p.relative_to(root).as_posix()}")
    print("Next: list real people in roles.yml, add CODEOWNERS, then run `doctor`.")
    return 0


def cmd_audit(args) -> int:
    entry = audit_append(Path(args.root).resolve(), args.log, {"type": args.actor_type, "id": args.actor_id},
                         args.action, **({"spec": args.spec} if args.spec else {}), **({"commit": args.commit} if args.commit else {}))
    print(entry["hash"])
    return 0


def cmd_selftest(args) -> int:
    good, rows = selftest.run_selftest()
    if args.json:
        print(json.dumps({"ok": good, "rows": rows}, indent=2))
    else:
        for r in rows:
            mark = "ok  " if r["expected"] == r["actual"] else "BAD "
            print(f"{mark} {r['check']:20} broken: {r['fixture']}\n       -> {r['actual']}: {r['detail'][:150]}")
        print(f"\n{'all self-tests behaved as expected' if good else 'SELF-TEST FAILURE'} ({len(rows)} fixtures)")
    return 0 if good else 1


def _captured(argv: list[str]) -> tuple[int, str]:
    """One command of the kit, run in this process: its exit code, and everything it printed."""
    printed = io.StringIO()
    with redirect_stdout(printed), redirect_stderr(printed):
        try:
            code = main(argv)
        except SystemExit as stop:  # argparse, after a usage error
            code = stop.code if isinstance(stop.code, int) else 2
    return code, printed.getvalue()


def cmd_demo(args) -> int:
    """One gate closes and opens again, in a throwaway project of the demo's own. `--root` is not read (DEMO-1)."""
    from . import demo
    return demo.run(_captured, keep=args.keep)


def cmd_changeset(args) -> int:
    """One page for one change, built from the repository. It records nothing and decides nothing (CHS-1)."""
    from . import changeset
    ctx = _context(args)
    if args.spec not in ctx.specs():
        print(f"spec {args.spec} does not exist", file=sys.stderr)
        return 2
    doc = changeset.build(ctx, args.spec)
    if args.write:
        try:
            done = changeset.write(ctx, args.spec, doc)
        except (KitError, OSError) as exc:
            print(f"{exc}\nNothing was written.", file=sys.stderr)
            return 2
        print(done, file=sys.stderr if args.json else sys.stdout)  # with --json, standard output holds the document and nothing else
    if args.json:
        print(json.dumps(doc, indent=2, default=str))
    elif not args.write:
        print(changeset.render(doc), end="")
    return 0


def cmd_list(args) -> int:
    for cid in sorted(REGISTRY):
        c = REGISTRY[cid]
        print(f"{cid:20} {', '.join(c.requirements):32} {'/'.join(c.profiles):26} {c.summary}")
    return 0


def cmd_search(args) -> int:
    """Find text in the files git tracks, each hit with the map node that owns its file (SRC-1 to SRC-14). It writes nothing.

    Ends as grep does: 0 with hits, 1 with none, 2 when it could not search."""
    from . import search
    try:
        found = search.search(_context(args), args.text, spec=args.spec, node=args.node, limit=args.limit, regex=args.regex,
                              ignore_case=args.ignore_case, kind=args.kind)
    except KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except Exception:  # a fault of the kit's own is shown as it is, and never ends with 1: that would say "no hits" (SRC-12)
        import traceback
        traceback.print_exc()
        return 2
    for line in [json.dumps(found.document(), indent=2)] if args.json else search.plain(found, args.spec):
        search.say(line)
    return 0 if found.total else 1


def build_parser() -> argparse.ArgumentParser:
    """Every command, action and flag the kit accepts, with what the other extensions add."""
    p = argparse.ArgumentParser(prog="agentic", description=f"agentic-spec-kit {__version__}")
    p.add_argument("--root", default=".", help="repository root (default: current directory)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, base=True):
        sp.add_argument("--json", action="store_true")
        if base:
            sp.add_argument("--base-ref", help="git ref to read roles.yml and kit.yml from (the base branch in CI)")

    sp = sub.add_parser("check", help="run checks for the active profile"); common(sp)
    sp.add_argument("ids", nargs="*"); sp.add_argument("--today"); sp.add_argument("--changed-files")
    sp.add_argument("--branch", help=BRANCH_HELP)
    sp.set_defaults(fn=cmd_check)
    sp = sub.add_parser("doctor", help="report enforcement setup and what is not enforced"); common(sp); sp.set_defaults(fn=cmd_doctor)
    sp = sub.add_parser("gate", help="show a gate's evidence, hash and the line to paste"); common(sp)
    sp.add_argument("--spec", required=True); sp.add_argument("--gate", required=True); sp.add_argument("--file", action="append")
    sp.set_defaults(fn=cmd_gate)
    sp = sub.add_parser("record", help="mirror an existing review into a decision record"); common(sp)
    sp.add_argument("--spec", required=True); sp.add_argument("--gate", required=True, choices=GATES)
    sp.add_argument("--change", help="pull/<n>: read its reviews and take the decision, the commit and the approvals from those that carry the gate's line")
    sp.add_argument("--decision"); sp.add_argument("--commit")
    sp.add_argument("--approval", action="append", help="reviewer:role:pull/<n>#review-<id>; with --decision and --commit, in place of --change")
    sp.add_argument("--condition", action="append"); sp.add_argument("--exception", action="store_true")
    sp.add_argument("--file", action="append"); sp.set_defaults(fn=cmd_record)
    sp = sub.add_parser("decision", help="the decision log of a change: add a question, record what a person decided, list; "
                                         "writing an entry approves nothing"); common(sp)
    sp.add_argument("action", choices=["add", "decide", "supersede", "list"]); sp.add_argument("--spec", required=True)
    sp.add_argument("--title", help="with add: the question")
    sp.add_argument("--by", help="with add: who asks; an id that roles.yml does not list as a person makes the entry a proposal. "
                                 "With supersede: the id of the entry that replaces this one")
    sp.add_argument("--id", help="with decide and supersede: the entry, as D-001")
    sp.add_argument("--outcome", help="with decide: what was decided"); sp.add_argument("--owner", help="with decide: the person who decided, as roles.yml lists them")
    sp.add_argument("--why", help="with decide: the reason"); sp.add_argument("--on", help="with decide: the day, as 2026-11-26 (default: today)")
    sp.add_argument("--affects", action="append", help="with add and decide: FR-001, T003, node:<map node id> or adr:<file>; repeat for several")
    sp.add_argument("--source", help="with add and decide: a link to where it was asked or decided"); sp.set_defaults(fn=cmd_decision)
    sp = sub.add_parser("brief", help="the one-page brief for the person at a gate"); common(sp)
    sp.add_argument("--spec", required=True); sp.add_argument("--gate", required=True, choices=GATES)
    sp.add_argument("--write", action="store_true"); sp.set_defaults(fn=cmd_brief)
    sp = sub.add_parser("report", help="views built from the repository: gate board, waivers, traceability, metrics and more"); common(sp)
    sp.add_argument("view", help="a view name, `all`, or `list`"); sp.add_argument("--spec"); sp.add_argument("--out")
    sp.add_argument("--html", action="store_true", help="with `all --out`: also write one page a person can open in a browser")
    sp.add_argument("--today"); sp.set_defaults(fn=cmd_report)
    sp = sub.add_parser("audit-pack", help="export the evidence for a release or a date range, with hashes; it supports an audit and certifies nothing")
    common(sp); sp.add_argument("--spec"); sp.add_argument("--from", dest="date_from"); sp.add_argument("--to", dest="date_to")
    sp.add_argument("--out", help="write the pack to this folder"); sp.add_argument("--write", action="store_true", help="keep the manifest with the spec, for the release gate")
    sp.add_argument("--today"); sp.set_defaults(fn=cmd_audit_pack)
    sp = sub.add_parser("amend", help="which gates a change re-opens; the constitution amendment report"); common(sp)
    sp.add_argument("action", choices=["status", "report"]); sp.add_argument("--spec")
    sp.add_argument("--write", action="store_true"); sp.set_defaults(fn=cmd_amend)
    sp = sub.add_parser("lane", help="the lane impact analysis puts each spec on, and the gates that follow"); common(sp)
    sp.add_argument("--spec"); sp.set_defaults(fn=cmd_lane)
    sp = sub.add_parser("trace", help="build the trace manifest and matrix"); common(sp)
    sp.add_argument("--spec"); sp.add_argument("--write", action="store_true"); sp.set_defaults(fn=cmd_trace)
    sp = sub.add_parser("suppressions", help="list detected suppressions or propose a baseline"); common(sp)
    sp.add_argument("--baseline", action="store_true"); sp.set_defaults(fn=cmd_suppressions)
    sp = sub.add_parser("init", help="write kit.yml, roles.yml, the constitution map and the CI workflow")
    sp.add_argument("--profile", required=True); sp.add_argument("--repository"); sp.add_argument("--pack", action="append")
    sp.add_argument("--force", action="store_true")
    sp.add_argument("--open-pr-workflow", action="store_true",
                    help="also write a workflow that opens a pull request as the workflow's own account, for the person who pushes a branch and approves its gate")
    sp.set_defaults(fn=cmd_init)
    sp = sub.add_parser("audit", help="append an entry to an audit log")
    sp.add_argument("--log", required=True); sp.add_argument("--actor-type", required=True, choices=["human", "agent", "kit"])
    sp.add_argument("--actor-id", required=True); sp.add_argument("--action", required=True)
    sp.add_argument("--spec"); sp.add_argument("--commit"); sp.set_defaults(fn=cmd_audit)
    sp = sub.add_parser("selftest", help="prove every check fails on its broken fixture"); sp.add_argument("--json", action="store_true")
    sp.set_defaults(fn=cmd_selftest)
    sp = sub.add_parser("list", help="list checks"); sp.set_defaults(fn=cmd_list)
    sp = sub.add_parser("search", help="find text in the files git tracks; with a system map each hit names its node, "
                                       "and --spec puts what a spec touches first"); common(sp, base=False)
    from .search import KINDS, LIMIT
    sp.add_argument("text", help="the text to find, as a fixed string; put `--` before one that starts with a dash")
    sp.add_argument("--spec", help="put first the hits in the nodes this spec touches, then those one edge away, then the rest")
    sp.add_argument("--node", help="search the files of this node of the system map only")
    sp.add_argument("--regex", action="store_true", help="read the text as an extended regular expression, as `git grep -E` does")
    sp.add_argument("--ignore-case", action="store_true", help="take upper and lower case as the same")
    sp.add_argument("--kind", choices=KINDS, default="all", help="specs is specs/, records is .specify/, code is everything else")
    sp.add_argument("--limit", type=int, default=LIMIT, help="the most hits to show; 0 shows all (default: %(default)s)")
    sp.set_defaults(fn=cmd_search)
    sp = sub.add_parser("demo", help="watch one gate close and open again, in a throwaway project where a file plays GitHub; "
                                     "it proves nothing about who approved")
    sp.add_argument("--keep", action="store_true", help="leave the throwaway project in place, and say where it is")
    sp.set_defaults(fn=cmd_demo)
    sp = sub.add_parser("changeset", help="one page for one change: where it came from, its gates, versions, tasks, branches and pull requests; "
                                          "it shows what is recorded and decides nothing")
    common(sp); sp.add_argument("--spec", required=True)
    sp.add_argument("--write", action="store_true", help="keep the page as specs/<spec>/changeset.md; it is never gate evidence")
    sp.set_defaults(fn=cmd_changeset)

    from .core import CLI_HOOKS
    for hook in CLI_HOOKS:
        hook(sub, common)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.fn(args)
    except KitError as exc:
        print(f"cannot run: {exc}", file=sys.stderr)
        return 2


PIPE_CLOSED = 141  # what a shell reports for a program stopped by a closed pipe


def reader_went_away(exc: OSError, stream=None, windows: bool | None = None) -> bool:
    """Whether `exc` says that whatever was reading standard output has stopped, as `head` does.

    Mostly that is a broken pipe. Windows can report it as an invalid argument, which can mean other
    things, so there it counts only when standard output itself can no longer take a line. A flush alone
    does not show that: a write larger than the buffer goes straight to the pipe, and when it fails nothing
    is left to flush (the first run on Windows, 2026-11-26; WIN-11). So an empty line is written and
    flushed. Where the output is intact that line reaches it, ahead of the other error's traceback."""
    if isinstance(exc, BrokenPipeError):
        return True
    if not ((os.name == "nt" if windows is None else windows) and exc.errno == errno.EINVAL):
        return False
    if exc.filename is not None or getattr(exc, "winerror", None) is not None:
        return False  # an invalid file name, or a refusal by Windows itself: a failed write is neither
    out = sys.stdout if stream is None else stream
    if out is None:
        return False
    try:
        out.flush()
        out.write("\n")
        out.flush()
    except (OSError, ValueError):
        return True
    return False


def cli(argv: list[str] | None = None):
    """`main`, for use as a program. When a write finds the reader gone, the run ends with no traceback and
    with PIPE_CLOSED in place of the command's own code: the output was cut short, so the caller did not get
    the result. Any other error is raised as before."""
    try:
        try:
            code = main(argv)
        except SystemExit as stop:  # argparse, after --help or a usage error
            code = stop.code
        if sys.stdout is not None:
            sys.stdout.flush()  # a closed pipe shows here, and not while the interpreter exits
    except OSError as exc:
        if not reader_went_away(exc):
            raise
        try:  # the interpreter flushes once more on its way out: give that somewhere to go
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except (OSError, ValueError, AttributeError):
            pass
        return PIPE_CLOSED
    return code


if __name__ == "__main__":
    sys.exit(cli())
