"""Governance checks for slice 0.1: profile, roles, upstream pin, enforcement setup, tiers,
constitution, gate records, approvers, mirror, waivers and domain-pack sections."""
from __future__ import annotations

import datetime
import fnmatch
import json
import os
import re
import subprocess

from . import adapters
from .core import (DECISIONS, GATES, IMPLEMENTATION_HOOKS, KIT_DIR, PROFILE_GATES, PROFILES, REGISTRY, TIERS, Context, KitError,
                   Result, check, evidence_hash, front_matter, match_any, parse_approval_lines)

#: Roles that must approve each gate. Standard and Regulated need all of them; Lite needs any one.
DEFAULT_APPROVERS = {
    "G0": ["product-owner", "solutions-architect", "security-compliance"],
    "G1": ["product-owner"],
    "G2": ["product-owner", "solutions-architect"],
    "G3": ["solutions-architect"],
    "G4": ["engineering-manager", "qa"],
    "G5": ["qa"],
    "G6": ["qa"],
    "G7": ["devops-sre", "product-owner"],
}
PROTECTED = [f"{KIT_DIR}/roles.yml", f"{KIT_DIR}/kit.yml", f"{KIT_DIR}/constitution.map.yml",
             f"{KIT_DIR}/waivers/baseline.yml", ".specify/memory/constitution.md"]


#: On the fast lane these gates are folded into G4, which then carries their evidence and their approvers (GOV-17).
FAST_MERGED = ("G1", "G2", "G3")


def lane(ctx: Context, spec: str | None) -> str:
    """'fast' or 'standard'. Computed by impact analysis through LANE_HOOKS; a spec cannot choose its own lane."""
    if not spec or spec == "_constitution" or ctx.profile == "lite":
        return "standard"
    if ((ctx.kit().get("lanes") or {}).get("fast") or {}).get("enabled") is False:
        return "standard"
    from .core import LANE_HOOKS
    return "fast" if any(hook(ctx, spec) == "fast" for hook in LANE_HOOKS) else "standard"


def required_gates(ctx: Context, spec: str | None = None) -> tuple[str, ...]:
    gates = PROFILE_GATES[ctx.profile]
    if lane(ctx, spec) == "fast":
        return tuple(g for g in gates if g not in FAST_MERGED)
    return gates


def _own_roles(ctx: Context, gate: str, spec: str | None) -> list[str]:
    override = ((ctx.kit().get("gates") or {}).get("approvers") or {}).get(gate)
    roles = list(override) if override else list(DEFAULT_APPROVERS[gate])
    if spec:
        from .core import ROLE_HOOKS
        for hook in ROLE_HOOKS:
            roles += [r for r in hook(ctx, spec, gate) if r not in roles]
    return roles


def gate_roles(ctx: Context, gate: str, spec: str | None = None) -> list[str]:
    """Roles that must approve a gate: the profile's defaults plus any a sibling extension derives for this spec."""
    roles = _own_roles(ctx, gate, spec)
    if gate == "G4" and lane(ctx, spec) == "fast":
        for merged in FAST_MERGED:
            roles += [r for r in _own_roles(ctx, merged, spec) if r not in roles]
    return roles


def people_by_role(roles: dict) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for person in roles.get("people") or []:
        for role in person.get("roles") or []:
            out.setdefault(role, set()).add(str(person.get("id", "")).lower())
    return out


def today(ctx: Context) -> datetime.date:
    raw = ctx.options.get("today")
    return datetime.date.fromisoformat(raw) if raw else datetime.date.today()


def as_date(value) -> datetime.date | None:
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value))
    except ValueError:
        return None


def decisions(ctx: Context) -> list[tuple[str, dict]]:
    out = []
    for rel in ctx.src.files(f"{KIT_DIR}/decisions"):
        if rel.endswith(".yml"):
            data = ctx.src.yaml(rel)
            out.append((rel, data if isinstance(data, dict) else {}))
    return out


def spec_front(ctx: Context, spec: str) -> dict:
    return front_matter(ctx.src.read(f"specs/{spec}/spec.md"))


# ── CK-PROFILE ──────────────────────────────────────────────────────────────────

@check("CK-PROFILE", ("GOV-13", "GOV-14"), "kit.yml is valid and names a known profile and installed packs")
def ck_profile(ctx: Context, res: Result) -> None:
    kit = ctx.kit()
    path = f"{KIT_DIR}/kit.yml"
    if kit.get("schema") != "agentic-kit/1":
        res.fail("schema must be agentic-kit/1", path)
    profile = kit.get("profile")
    if profile not in PROFILES:
        res.fail(f"profile {profile!r} is not one of {', '.join(PROFILES)}", path)
        return
    packs = kit.get("domain_packs") or []
    if profile == "regulated" and not packs:
        res.fail("the regulated profile needs at least one domain pack", path)
    for pack in packs:
        if ctx.pack(str(pack)) is None:
            res.fail(f"domain pack {pack!r} is not installed ({KIT_DIR}/packs/{pack}.yml is missing)", path)
    enforcement = (kit.get("enforcement") or {}).get("adapter")
    if enforcement not in ("github", "file"):
        res.fail(f"enforcement.adapter {enforcement!r} is not supported", path)
    gates = kit.get("gates") or {}
    if gates.get("require_evidence_hash") is False and profile != "lite":
        res.fail("require_evidence_hash may be false only in the lite profile", path)
    if gates.get("single_approver_exception", "forbidden") not in ("allowed", "forbidden"):
        res.fail("gates.single_approver_exception must be allowed or forbidden", path)


# ── CK-ROLES ────────────────────────────────────────────────────────────────────

@check("CK-ROLES", ("GOV-1", "GOV-2", "GOV-3"), "every gate and spec has an accountable role with a person behind it")
def ck_roles(ctx: Context, res: Result) -> None:
    roles = ctx.roles()
    path = f"{KIT_DIR}/roles.yml"
    if roles.get("schema") != "agentic-roles/1":
        res.fail("schema must be agentic-roles/1", path)
    defined = set((roles.get("roles") or {}).keys())
    seen: set[str] = set()
    for person in roles.get("people") or []:
        pid = str(person.get("id", "")).lower()
        if not pid:
            res.fail("a person has no id", path)
        if pid in seen:
            res.fail(f"person {pid} is listed twice", path)
        seen.add(pid)
        for role in person.get("roles") or []:
            if role not in defined:
                res.fail(f"person {pid} holds undefined role {role}", path)
    holders = people_by_role(roles)
    profile = ctx.profile
    unfilled: dict[str, list[str]] = {}
    for gate in ("G0",) + PROFILE_GATES.get(profile, ()):
        needed = gate_roles(ctx, gate)
        missing = [r for r in needed if not holders.get(r)]
        if profile == "lite":
            if len(missing) == len(needed):
                res.fail(f"gate {gate} has nobody in any of: {', '.join(needed)}", path)
        else:
            for role in missing:
                unfilled.setdefault(role, []).append(gate)
    for role, gates in unfilled.items():
        res.fail(f"role {role} is required at {', '.join(gates)} and nobody holds it", path)
    for spec in ctx.specs():
        owner = spec_front(ctx, spec).get("owner_role")
        if not owner:
            res.fail("spec has no owner_role", f"specs/{spec}/spec.md")
        elif owner not in defined:
            res.fail(f"owner_role {owner} is not a defined role", f"specs/{spec}/spec.md")
    # Separation-of-duties report (GOV-3): information, not a failure.
    approver_roles = {r for g in PROFILE_GATES.get(profile, ()) for r in gate_roles(ctx, g)}
    for pid in sorted(seen):
        held = sorted(r for r in approver_roles if pid in holders.get(r, set()))
        if len(held) > 1:
            res.notes.append(f"separation of duties: {pid} holds {len(held)} approving roles ({', '.join(held)})")
    if len(seen) == 1:
        res.notes.append("separation of duties: one person holds every role; every approval is a single-approver exception")


# ── CK-UPSTREAM-PIN ─────────────────────────────────────────────────────────────

@check("CK-UPSTREAM-PIN", ("ADP-1",), "the installed Spec Kit version matches the pin in kit.yml")
def ck_upstream_pin(ctx: Context, res: Result) -> None:
    pin = str((ctx.kit().get("upstream") or {}).get("speckit", "")).lstrip("v")
    if not pin:
        res.fail("upstream.speckit is not set", f"{KIT_DIR}/kit.yml")
        return
    marker = ".specify/init-options.json"
    if not ctx.src.exists(marker):
        raise KitError(f"{marker} is missing, so the installed Spec Kit version is unknown")
    installed = str(json.loads(ctx.src.read(marker)).get("speckit_version", "")).lstrip("v")
    if installed != pin:
        res.fail(f"Spec Kit {installed or 'unknown'} is installed but kit.yml pins {pin}", marker)


# ── CK-ENFORCE-SETUP ────────────────────────────────────────────────────────────

def _codeowners(ctx: Context) -> list[str] | None:
    for rel in (".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"):
        if ctx.src.exists(rel):
            pats = []
            for line in ctx.src.read(rel).splitlines():
                line = line.split("#", 1)[0].strip()
                if line and len(line.split()) >= 2:  # a pattern with no owner protects nothing
                    pats.append(line.split()[0])
            return pats
    return None


def _covered(path: str, patterns: list[str]) -> bool:
    for pat in patterns:
        p = pat.lstrip("/")
        if pat == "*" or fnmatch.fnmatch(path, p) or (p.endswith("/") and path.startswith(p)) or path.startswith(p.rstrip("/") + "/"):
            return True
    return False


@check("CK-ENFORCE-SETUP", ("GOV-8", "ADP-3"), "the enforcement channel is configured so approvals can be trusted")
def ck_enforce_setup(ctx: Context, res: Result) -> None:
    soft = ctx.profile == "lite"
    report = res.notes.append if soft else None

    def problem(message: str, path: str = "") -> None:
        if report:
            report(f"not enforced: {message}")
        else:
            res.fail(message, path)

    owners = _codeowners(ctx)
    if owners is None:
        problem("there is no CODEOWNERS file, so changes to roles, waivers and the constitution need no owner review")
    else:
        for rel in PROTECTED:
            if not _covered(rel, owners):
                problem(f"CODEOWNERS does not cover {rel}", "CODEOWNERS")
    adapter = adapters.enforcement(ctx)
    agent = (adapter.agent_identity() or "").lower()
    approvers = {p for people in people_by_role(ctx.roles()).values() for p in people}
    if agent and agent in approvers:
        problem(f"the agent's own account ({agent}) is listed in roles.yml, so it could approve its own work",
                f"{KIT_DIR}/roles.yml")
    for row in adapter.setup_report():
        text = f"{row['item']}" + (f": {row['detail']}" if row.get("detail") else "")
        if row["status"] == "fail":
            problem(text)
        elif row["status"] == "not-checkable":
            res.notes.append(f"not checkable: {text}")


# ── CK-TIER ─────────────────────────────────────────────────────────────────────

@check("CK-TIER", ("GOV-9",), "every spec declares a known risk tier")
def ck_tier(ctx: Context, res: Result) -> None:
    for spec in ctx.specs():
        tier = spec_front(ctx, spec).get("tier_declared")
        if tier not in TIERS:
            res.fail(f"tier_declared {tier!r} is not one of {', '.join(TIERS)}", f"specs/{spec}/spec.md")


# ── CK-CONSTITUTION ─────────────────────────────────────────────────────────────

_PID = re.compile(r"\bP-[0-9]+\b")


def constitution_map(ctx: Context) -> dict | None:
    rel = f"{KIT_DIR}/constitution.map.yml"
    holder = ctx.trusted if ctx.trusted.exists(rel) else ctx.src
    return holder.yaml(rel) if holder.exists(rel) else None


@check("CK-CONSTITUTION", ("GOV-11",), "each principle is machine-checked or explicitly human-judged",
       profiles=("standard", "regulated"))
def ck_constitution(ctx: Context, res: Result) -> None:
    rel = f"{KIT_DIR}/constitution.map.yml"
    cmap = constitution_map(ctx)
    const = ".specify/memory/constitution.md"
    if cmap is None:
        res.fail("constitution.map.yml is missing", rel)
        return
    external = set((cmap.get("external_checks") or {}).keys())
    ids = set()
    for p in cmap.get("principles") or []:
        pid = str(p.get("id", ""))
        if not re.fullmatch(r"P-[0-9]+", pid):
            res.fail(f"principle id {pid!r} is not of the form P-<number>", rel)
            continue
        if pid in ids:
            res.fail(f"{pid} is mapped twice", rel)
        ids.add(pid)
        mode = p.get("enforcement")
        if mode == "machine":
            refs = p.get("checks") or []
            if not refs:
                res.fail(f"{pid} is machine-enforced but names no check", rel)
            for ref in refs:
                if str(ref).startswith("ck:"):
                    if str(ref)[3:] not in REGISTRY:
                        res.fail(f"{pid} names kit check {ref}, which does not exist", rel)
                elif ref not in external:
                    res.fail(f"{pid} names check {ref}, which is not declared under external_checks", rel)
        elif mode == "human":
            if p.get("judged_at") not in GATES:
                res.fail(f"{pid} is human-judged but names no gate (judged_at)", rel)
        else:
            res.fail(f"{pid} enforcement must be machine or human", rel)
    if ctx.src.exists(const):
        for pid in sorted(set(_PID.findall(ctx.src.read(const))) - ids):
            res.fail(f"{pid} appears in the constitution but not in the map", const)


# ── CK-GATE-RECORD ──────────────────────────────────────────────────────────────

def _commit(rec: dict) -> str:
    """The decision's commit as text. YAML reads an all-digit SHA as a number, so never test it for truthiness."""
    value = rec.get("commit")
    return "" if value is None else str(value).strip()


def _has_commit(ctx: Context, commit: str) -> bool | None:
    """True/False when the repo is a git repo; None when it is not (fixtures, exported trees)."""
    if not (ctx.src.root / ".git").exists():
        return None
    p = subprocess.run(["git", "-C", str(ctx.src.root), "cat-file", "-e", f"{commit}^{{commit}}"], capture_output=True)
    return p.returncode == 0


#: GOV-4 names the gates in order: constitution, spec, clarify, plan, tasks and analysis, implementation, verification,
#: release. Work on a spec's tasks may start once every gate before the implementation gate is approved, and may be
#: merged once the implementation and verification gates are approved too. A release may be decided after the merge,
#: so nothing here asks for G7.
IMPLEMENTATION_GATE, VERIFICATION_GATE = "G5", "G6"
_TICKED = re.compile(r"^\s*[-*]\s*\[[xX]\]\s*(T\d+)\b", re.M)


def some(ids, limit: int = 6) -> str:
    """Ids for a message: the first few, then how many more there are."""
    ids = [str(i) for i in ids]
    return ", ".join(ids[:limit]) + (f" and {len(ids) - limit} more" if len(ids) > limit else "")


def implementation(ctx: Context) -> dict[str, list[str]]:
    """Spec -> what shows that work on its tasks is in this tree, as short phrases. A spec with nothing to show is left out.

    The core reads the task list: a ticked task is a finished task. Sibling extensions add what they record (the team
    extension: work items that are done or were handed off, and commits that name one). Code written with none of
    these marks is not seen.
    """
    found: dict[str, list[str]] = {}
    for spec in ctx.specs():
        rel = f"specs/{spec}/tasks.md"
        if ctx.src.exists(rel):
            ticked = list(dict.fromkeys(_TICKED.findall(ctx.src.read(rel))))
            if ticked:
                found[spec] = [f"tasks ticked off in tasks.md: {some(ticked)}"]
    for hook in IMPLEMENTATION_HOOKS:
        for spec, phrases in hook(ctx).items():
            if phrases:
                found.setdefault(spec, []).extend(phrases)
    return found


def default_branch(ctx: Context) -> str:
    return str((ctx.kit().get("enforcement") or {}).get("default_branch") or "main")


def own_repository(ctx: Context) -> bool:
    """Is the project root the top of a git repository of its own?

    A project kept in a folder of another repository is not. Asked there, git answers for that repository: its branch,
    its commits. The reference example in this kit's repository is such a folder.
    """
    root = ctx.src.root
    if not (root / ".git").exists():
        return False
    try:
        p = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
        return p.returncode == 0 and bool(p.stdout.strip()) and os.path.samefile(p.stdout.strip(), root)
    except OSError:
        return False


def on_default_branch(ctx: Context) -> tuple[bool | None, str]:
    """Is the tree under check on the default branch? True, False, or None for "cannot tell"; and for None, why.

    The default branch is the one kit.yml names (enforcement.default_branch). The first answer that can be had is taken:

    1. The caller says which branch the files are from: `--branch <name or full ref>`. That is for the places git
       cannot answer for. Nothing depends on remembering it: the pipeline files the kit ships do not pass it.
    2. Git says, and only where the project root is the top of its own repository (see own_repository). A pipeline's
       full clone is one:
       - yes, when the default branch is checked out, or a commit with no branch (what most pipelines check out)
         that the default branch contains;
       - no, when what is checked out has commits the default branch does not have, and is compared with a branch,
         with a commit of the default branch, or with nothing. That is a change proposed to a branch.
    3. Otherwise: cannot tell. The caller of this function says so in a note; it does not pass in silence. The cases:
       - the root is not a repository of its own, or no branch has the name kit.yml gives;
       - another branch is checked out at a commit the default branch already holds: a branch just started, or
         the default branch under another name;
       - what is checked out is compared with a bare commit that the default branch does not hold. A push to the
         default branch is checked that way, against the commit before it. So this is the default branch under
         another name or with an out-of-date copy beside it, or it is a feature branch compared with its own past.
    """
    default = default_branch(ctx)
    stated = str(ctx.options.get("branch") or "").strip()
    if stated:
        return stated in (default, f"refs/heads/{default}"), ""
    if not own_repository(ctx):
        return None, "the project root is not the top of a git repository"

    def git(*args: str) -> tuple[int, str]:
        p = subprocess.run(["git", "-C", str(ctx.src.root), *args], capture_output=True, text=True)
        return p.returncode, p.stdout.strip()

    try:
        code, branch = git("symbolic-ref", "-q", "--short", "HEAD")
        branch = branch if code == 0 else ""
        if branch == default:
            return True, ""
        what = f"branch {branch}" if branch else "a commit with no branch"
        refs = (f"refs/heads/{default}", f"refs/remotes/*/{default}")  # the default branch, here and as each remote has it
        code, known = git("for-each-ref", "--format=%(refname)", *refs)
        if code or not known:  # a wrong name in kit.yml, or a clone of one branch: either way nothing to judge by
            return None, f"the repository has no branch {default}; enforcement.default_branch in kit.yml names the default branch"
        code, holding = git("for-each-ref", "--format=%(refname)", "--contains", "HEAD", *refs)
        if code:
            return None, "git could not read HEAD"
        if holding:
            return (True, "") if not branch else (None, f"{what} is checked out at a commit that {default} already holds")
        base = str(ctx.trusted.ref or "")
        if base:
            code, holding = git("for-each-ref", "--format=%(refname)", "--contains", base, *refs)
            if code or not holding:
                _, named = git("rev-parse", "--symbolic-full-name", base)  # a branch gives its full name; a commit id gives nothing
                if not named.startswith(("refs/heads/", "refs/remotes/")):
                    return None, f"{what} is checked out and compared with {short_ref(base)}, a commit that is not on {default} as this repository has it"
        return False, ""
    except OSError:
        return None, "git could not be run"


def short_ref(ref: str) -> str:
    """A ref for a message: a full commit id is cut to ten characters, a name is left as it is."""
    return ref[:10] if re.fullmatch(r"[0-9a-f]{40}", ref) else ref


@check("CK-GATE-RECORD", ("GOV-4", "GOV-5", "TRC-18", "AGT-5"), "gate decisions are complete, ordered and bound to their evidence")
def ck_gate_record(ctx: Context, res: Result) -> None:
    need_hash = (ctx.kit().get("gates") or {}).get("require_evidence_hash", ctx.profile != "lite")
    approved: dict[str, set[str]] = {}
    for rel, rec in decisions(ctx):
        parts = rel.split("/")
        spec, gate = parts[-2], parts[-1][:-4]
        if rec.get("schema") != "agentic-decision/1":
            res.fail("schema must be agentic-decision/1", rel)
        if rec.get("spec") != spec or rec.get("gate") != gate:
            res.fail("spec and gate must match the file's folder and name", rel)
        if gate not in GATES:
            res.fail(f"{gate} is not a gate", rel)
            continue
        if spec != "_constitution" and not ctx.src.exists(f"specs/{spec}/spec.md"):
            res.fail(f"there is no spec {spec}", rel)
        decision = rec.get("decision")
        if decision not in DECISIONS:
            res.fail(f"decision {decision!r} is not one of {', '.join(DECISIONS)}", rel)
        if decision == "approve-with-conditions" and not rec.get("conditions"):
            res.fail("approve-with-conditions needs at least one condition", rel)
        commit = _commit(rec)
        if not commit:
            res.fail("the decision is not tied to a commit", rel)
        if not rec.get("approvals"):
            res.fail("the decision names no approval", rel)
        evidence = rec.get("evidence") or {}
        files = evidence.get("files") or []
        if not files:
            res.fail("the decision lists no evidence files", rel)
        elif need_hash or evidence.get("hash"):
            known = _has_commit(ctx, commit) if commit else None
            if known is False:
                res.fail(f"commit {commit} is not in this repository", rel)
            else:
                source = ctx.src.at(commit) if known else ctx.src
                try:
                    actual = evidence_hash(source, spec, gate, files)
                    if actual != evidence.get("hash"):
                        res.fail("the evidence hash does not match the evidence files at the decision's commit", rel)
                except KitError as exc:
                    res.fail(str(exc), rel)
        if decision in ("approve", "approve-with-conditions"):
            approved.setdefault(spec, set()).add(gate)
    from .lanes import retrospective_specs  # imported here: lanes imports this module
    started = implementation(ctx)
    excused = retrospective_specs(ctx)
    code_gate, last_gate = GATES.index(IMPLEMENTATION_GATE), GATES.index(VERIFICATION_GATE)
    branch = None           # (is this the default branch?, and why not when it cannot be told): asked once, and only if a spec needs it
    untold: list[str] = []  # specs whose gates before a merge were not asked for, because the branch could not be told
    for spec in ctx.specs():
        required = required_gates(ctx, spec)
        have = approved.get(spec, set())
        for gate in sorted(have):
            if gate in required:
                for earlier in required[:required.index(gate)]:
                    if earlier not in have:
                        res.fail(f"{gate} is approved but the earlier gate {earlier} is not", f"specs/{spec}")
        implied = []
        if ctx.src.exists(f"specs/{spec}/plan.md"):
            implied += [g for g in ("G1", "G2") if g in required]
        if ctx.src.exists(f"specs/{spec}/tasks.md"):
            implied += [g for g in ("G3",) if g in required]
        for gate in implied:
            if gate not in have:
                artifact = "plan.md" if gate in ("G1", "G2") else "tasks.md"
                res.fail(f"{artifact} exists but gate {gate} has no approving decision record", f"specs/{spec}")
        if spec not in started:
            continue
        # Work on the tasks: every gate before the implementation gate comes first, on any branch. A gate the lines
        # above already reported is not reported twice.
        what = "; ".join(started[spec])
        for gate in required:
            if GATES.index(gate) < code_gate and gate not in have and gate not in implied:
                res.fail(f"implementation has started but gate {gate} has no approving decision record ({what})", f"specs/{spec}")
        # A merge: the implementation and verification gates come first. That is asked on the default branch only; on a
        # feature branch or a pull request the work is still in progress. An open emergency lets these gates follow the
        # change (GOV-18), and CK-EMERGENCY-DEADLINE holds its retrospective spec to the date.
        lacking = [g for g in required if code_gate <= GATES.index(g) <= last_gate and g not in have]
        if not lacking or spec in excused:
            continue
        branch = branch or on_default_branch(ctx)
        if branch[0]:
            for gate in lacking:
                res.fail(f"the implementation is on the default branch ({default_branch(ctx)}) but gate {gate} has no approving "
                         f"decision record ({what})", f"specs/{spec}")
        elif branch[0] is None:
            untold.append(f"{spec} ({', '.join(lacking)})")
    if untold:
        res.notes.append(f"could not tell whether this is the default branch ({branch[1]}), so the gates before a merge were not "
                         f"asked for: {some(untold)}; say which branch it is with --branch")


# ── CK-APPROVER and CK-GATE-MIRROR ──────────────────────────────────────────────

_REF = re.compile(r"(pull/[1-9][0-9]*)#review-(\S+)")


def _review(adapter, ref: str):
    m = _REF.fullmatch(str(ref or ""))
    if not m:
        return None, None
    change = m.group(1)
    for r in adapter.reviews(change):
        if r.id == m.group(2):
            return change, r
    return change, None


def _approver_problems(ctx: Context, adapter, holders: dict, review, change: str, reviewer: str, role: str | None) -> list[str]:
    out = []
    excluded = {x.lower() for x in (adapter.agent_identity(), adapter.ci_identity()) if x}
    who = review.reviewer.lower()
    if who != str(reviewer).lower():
        out.append(f"the record says {reviewer} but the review is by {review.reviewer}")
    if review.account_type != "User":
        out.append(f"{review.reviewer} is not a human account")
    if who in excluded:
        out.append(f"{review.reviewer} is the agent's or CI's own identity")
    everyone = {p for people in holders.values() for p in people}
    if who not in everyone:
        out.append(f"{review.reviewer} is not listed in roles.yml on the base branch")
    elif role is not None and who not in holders.get(role, set()):
        out.append(f"{review.reviewer} does not hold role {role}")
    return out


@check("CK-APPROVER", ("GOV-6", "GOV-7", "GOV-16"), "every approval comes from an entitled human through the enforcement channel")
def ck_approver(ctx: Context, res: Result) -> None:
    adapter = adapters.enforcement(ctx)
    holders = people_by_role(ctx.roles())
    allow_exception = (ctx.kit().get("gates") or {}).get("single_approver_exception", "forbidden") == "allowed"
    for rel, rec in decisions(ctx):
        gate, decision = rec.get("gate"), rec.get("decision")
        if gate not in GATES or decision not in DECISIONS:
            continue  # CK-GATE-RECORD reports malformed records
        wanted_state = "CHANGES_REQUESTED" if decision == "reject" else "APPROVED"
        covered: set[str] = set()
        for ap in rec.get("approvals") or []:
            change, review = _review(adapter, ap.get("review_ref"))
            if review is None:
                res.fail(f"review {ap.get('review_ref')!r} was not found in the enforcement channel", rel)
                continue
            problems = _approver_problems(ctx, adapter, holders, review, change, ap.get("reviewer", ""), ap.get("role"))
            if review.state != wanted_state:
                problems.append(f"the review state is {review.state or 'unknown'}, not {wanted_state}")
            commit = _commit(rec)
            if commit and not (review.commit.startswith(commit) or commit.startswith(review.commit)) or not review.commit:
                problems.append("the review is on a different commit from the decision")
            if review.reviewer.lower() in adapter.authors(change):
                if not allow_exception:
                    problems.append(f"{review.reviewer} authored the change and exceptions are forbidden")
                elif rec.get("single_approver_exception") is not True:
                    problems.append(f"{review.reviewer} authored the change but single_approver_exception is not recorded")
            for p in problems:
                res.fail(p, rel)
            if not problems and ap.get("role"):
                covered.add(ap["role"])
        if decision != "reject":
            needed = gate_roles(ctx, gate, str(rec.get("spec")))
            if ctx.profile == "lite":
                if not covered & set(needed):
                    res.fail(f"gate {gate} needs a valid approval from one of: {', '.join(needed)}", rel)
            else:
                for role in needed:
                    if role not in covered:
                        res.fail(f"gate {gate} has no valid approval from role {role}", rel)
    for rel, body in _waiver_files(ctx):
        ap = body.get("approved_by")
        if not ap:
            continue
        change, review = _review(adapter, ap.get("review_ref"))
        if review is None:
            res.fail(f"review {ap.get('review_ref')!r} was not found in the enforcement channel", rel)
            continue
        problems = _approver_problems(ctx, adapter, holders, review, change, ap.get("reviewer", ""),
                                      "security-compliance" if body.get("critical") else None)
        if review.state != "APPROVED":
            problems.append(f"the review state is {review.state or 'unknown'}, not APPROVED")
        for p in problems:
            res.fail(p, rel)


@check("CK-GATE-MIRROR", ("GOV-6", "TRC-18"), "decision records and reviews in the enforcement channel agree")
def ck_gate_mirror(ctx: Context, res: Result) -> None:
    adapter = adapters.enforcement(ctx)
    need_hash = (ctx.kit().get("gates") or {}).get("require_evidence_hash", ctx.profile != "lite")
    recorded: set[tuple[str, str, str]] = set()
    changes: set[str] = set()
    for rel, rec in decisions(ctx):
        gate, decision = str(rec.get("gate")), str(rec.get("decision"))
        digest = str((rec.get("evidence") or {}).get("hash") or "")
        for ap in rec.get("approvals") or []:
            change, review = _review(adapter, ap.get("review_ref"))
            if change:
                changes.add(change)
            if review is None:
                continue  # CK-APPROVER reports missing reviews
            lines = parse_approval_lines(review.body)
            for line in lines:
                recorded.add((change, review.id, line[0]))
            if need_hash and (gate, decision, digest) not in lines:
                res.fail(f"review {ap.get('review_ref')} does not state `gate {gate} {decision} {digest[:19]}…`", rel)
        for earlier in rec.get("superseded") or []:  # reviews behind a decision that was later made again are accounted for
            for ap in earlier.get("approvals") or []:
                change, review = _review(adapter, ap.get("review_ref"))
                if review is not None:
                    recorded.add((change, review.id, gate))
    for change in sorted(changes):
        for review in adapter.reviews(change):
            for gate, decision, digest in parse_approval_lines(review.body):
                if (change, review.id, gate) not in recorded:
                    res.fail(f"{change}#review-{review.id} states a decision for {gate} that no decision record mirrors")


# ── CK-WAIVER ───────────────────────────────────────────────────────────────────

def _waiver_files(ctx: Context) -> list[tuple[str, dict]]:
    out = []
    for rel in ctx.src.files(f"{KIT_DIR}/waivers"):
        if rel.endswith(".yml"):
            data = ctx.src.yaml(rel)
            out.append((rel, data if isinstance(data, dict) else {}))
    return out


def active_waivers(ctx: Context, res: Result | None = None) -> tuple[list, dict]:
    """Unexpired waivers and baseline groups. With `res`, every problem in a waiver file is reported."""
    fail = res.fail if res is not None else (lambda *a, **k: None)
    now = today(ctx)
    defined = set((ctx.roles().get("roles") or {}).keys())
    waivers, groups = [], {}
    for rel, body in _waiver_files(ctx):
        if rel.endswith("/baseline.yml"):
            if body.get("schema") != "agentic-baseline/1":
                fail("schema must be agentic-baseline/1", rel)
            if not body.get("approved_by"):
                fail("the baseline has no approval", rel)
            for g in body.get("groups") or []:
                rule = g.get("rule")
                for key in ("rule", "count", "owner", "reason", "expires"):
                    if g.get(key) in (None, ""):
                        fail(f"baseline group {rule or '?'} has no {key}", rel)
                exp = as_date(g.get("expires"))
                if exp is None or exp < now:
                    fail(f"baseline group {rule} expired on {g.get('expires')}", rel)
                elif isinstance(g.get("count"), int):
                    groups[rule] = (int(g["count"]), rel)
            continue
        if body.get("schema") != "agentic-waiver/1":
            fail("schema must be agentic-waiver/1", rel)
        for key in ("id", "rule", "reason", "owner", "compensating_control", "expires"):
            if not body.get(key):
                fail(f"waiver has no {key}", rel)
        if not (body.get("scope") or {}).get("paths"):
            fail("waiver has no scope.paths", rel)
        if body.get("owner") and body["owner"] not in defined:
            fail(f"owner {body['owner']} is not a defined role", rel)
        if body.get("critical") and not body.get("approved_by"):
            fail("a critical waiver needs approved_by from Security & Compliance", rel)
        exp = as_date(body.get("expires"))
        if exp is None:
            fail("expires is not a date", rel)
        elif exp < now:
            fail(f"waiver {body.get('id')} expired on {exp.isoformat()}", rel)
        else:
            waivers.append((rel, body))
    return waivers, groups


def report_unwaived(ctx: Context, res: Result, owner: str, waivers: list, groups: dict, what: str = "suppression(s)") -> set[str]:
    """Fail for every finding of a rule that `owner` reports and that no waiver or baseline group covers.

    Returns the waiver files that matched something. Sibling extensions call this for their own rules.
    """
    from .core import RULE_OWNERS
    used: set[str] = set()
    unwaived: dict[str, list[dict]] = {}
    for s in adapters.find_suppressions(ctx):
        hit = None
        for rel, w in waivers:
            scope = w.get("scope") or {}
            if w.get("rule") == s["rule"] and match_any(s["path"], scope.get("paths") or []) and \
                    (not scope.get("pattern") or scope["pattern"] in s["text"]):
                hit = rel
                break
        if hit:
            used.add(hit)
        else:
            unwaived.setdefault(s["rule"], []).append(s)
    for rule in sorted(set(unwaived) | set(groups)):
        if RULE_OWNERS.get(rule, "CK-WAIVER") != owner:
            continue
        items = unwaived.get(rule, [])
        allowed, rel = groups.get(rule, (0, ""))
        if len(items) > allowed:
            extra = len(items) - allowed
            where = f" (the baseline allows {allowed})" if allowed else ""
            res.fail(f"{extra} {rule} {what} have no waiver{where}")
            for s in items[:5]:
                res.fail(f"{rule}: {s['text']}", f"{s['path']}:{s['line']}" if s.get("line") else s["path"])
        elif len(items) < allowed:
            res.notes.append(f"baseline group {rule} can be lowered from {allowed} to {len(items)}")
    return used


@check("CK-WAIVER", ("GOV-15", "GOV-16", "GOV-21", "QLT-12"), "every suppression is waived or in the adoption baseline, and nothing has expired")
def ck_waiver(ctx: Context, res: Result) -> None:
    waivers, groups = active_waivers(ctx, res)
    used = report_unwaived(ctx, res, ctx.options.get("rule_owner", "CK-WAIVER"), waivers, groups)
    # A waiver for a rule another check reports is used there, not here.
    from .core import RULE_OWNERS
    for rel, w in waivers:
        if rel not in used and RULE_OWNERS.get(w.get("rule"), "CK-WAIVER") == "CK-WAIVER":
            res.notes.append(f"waiver matches no suppression and can be removed: {rel}")


# ── CK-DOMAIN-SECTIONS ──────────────────────────────────────────────────────────

@check("CK-DOMAIN-SECTIONS", ("ADP-14",), "specs contain every section the active domain packs require",
       profiles=("regulated",))
def ck_domain_sections(ctx: Context, res: Result) -> None:
    for pack in ctx.kit().get("domain_packs") or []:
        body = ctx.pack(str(pack))
        if body is None:
            raise KitError(f"domain pack {pack} is not installed")
        required = body.get("required_sections") or []
        for spec in ctx.specs():
            text = ctx.src.read(f"specs/{spec}/spec.md")
            for heading in required:
                m = re.search(rf"^#{{2,4}}\s+{re.escape(heading)}\s*$(.*?)(?=^#{{1,4}}\s|\Z)", text, re.M | re.S)
                if not m:
                    res.fail(f"section '{heading}' required by the {pack} pack is missing", f"specs/{spec}/spec.md")
                elif not re.sub(r"<!--.*?-->", "", m.group(1), flags=re.S).strip():
                    res.fail(f"section '{heading}' required by the {pack} pack is empty", f"specs/{spec}/spec.md")
