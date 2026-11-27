"""Agent-team checks for slice 0.3 (AGT-1 to AGT-13, ADP-10 to ADP-13)."""
from __future__ import annotations

import subprocess

from agentic_kit import adapters
from agentic_kit.checks_gov import decisions, own_repository, people_by_role, short_ref, some
from agentic_kit.core import KIT_DIR, Context, KitError, Result, check

from . import agents as ag
from . import golden, work

EXEMPT = ("specs/", ".specify/", ".claude/", ".github/", "system-map/")
#: Token scopes that let the holder publish, deploy, rewrite CI or administer; none belongs on an agent's credential.
DANGEROUS_SCOPES = ("admin:org", "admin:enterprise", "admin:repo_hook", "admin:org_hook", "delete_repo", "write:packages",
                    "delete:packages", "workflow", "admin:public_key", "admin:gpg_key", "site_admin")


@check("CK-AGENT-SPEC", ("AGT-1", "AGT-2", "ADP-10", "ADP-11", "ADP-12", "ADP-13"),
       "agent specs are valid and the runtime files are exactly what the specs render to")
def ck_agent_spec(ctx: Context, res: Result) -> None:
    files = ag.spec_files(ctx)
    if not files:
        raise KitError(f"no agent specs in {ag.AGENTS_DIR}; run the team init command")
    roles = set((ctx.roles().get("roles") or {}).keys())
    for rel in files:
        raw = ctx.src.yaml(rel)
        if not isinstance(raw, dict):
            res.fail("the agent spec is not a mapping", rel)
            continue
        merged = dict(raw)
        for profile, patch in (raw.get("overrides") or {}).items():
            if profile not in ("lite", "standard", "regulated") or not isinstance(patch, dict):
                res.fail(f"overrides.{profile} is not a profile with a mapping of fields", rel)
        merged.update((raw.get("overrides") or {}).get(ctx.profile) or {})
        for problem in ag.validate(merged, rel, roles):
            res.fail(problem, rel)
    specs = ag.load(ctx, trusted=False)
    for missing in ag.minimum_team_missing(sorted(specs)):
        res.fail(f"the minimum team is incomplete: {missing} is missing", ag.AGENTS_DIR)
    if res.findings:
        return
    expected = ag.rendered_files(ctx, specs)
    for rel, text in sorted(expected.items()):
        if not ctx.src.exists(rel):
            res.fail("the runtime file has not been rendered; run the team render command", rel)
        elif ctx.src.read(rel).replace("\r\n", "\n") != text:
            res.fail("the runtime file differs from a fresh render of its spec; edit the spec, not this file", rel)
    for folder in (".claude/agents", ".github/agents"):
        for rel in ctx.src.files(folder):
            if rel not in expected and ag.MARK in ctx.src.read(rel)[:2000]:
                res.fail("a generated agent file has no agent spec behind it", rel)
    for runtime in ag.team_config(ctx)["runtimes"]:
        res.notes.append(f"{ag.RUNTIMES[runtime]['title']}: write paths are {ag.RUNTIMES[runtime]['enforces']['paths']}")


def _history_states(item: dict) -> list[str]:
    return [str(h.get("state")) for h in item.get("history") or [] if isinstance(h, dict)]


@check("CK-WORKITEM", ("AGT-3",), "work items are valid, move only through legal states, and are done only with handoff evidence")
def ck_workitem(ctx: Context, res: Result) -> None:
    specs = ag.load(ctx)
    known_specs = set(ctx.specs())
    for item in work.items(ctx):
        rel = item["_file"]
        label = f"{item.get('spec')}/{item.get('id')}"
        if item.get("schema") != "agentic-work/1":
            res.fail("schema must be agentic-work/1", rel)
        if rel != f"{work.WORK_DIR}/{item.get('spec')}/{item.get('id')}.yml":
            res.fail(f"{label} does not match its file path", rel)
        if item.get("spec") not in known_specs:
            res.fail(f"{label} belongs to a spec that does not exist", rel)
        state = item.get("state")
        if state not in work.STATES:
            res.fail(f"{label} has unknown state {state!r}", rel)
            continue
        if item.get("owner_agent") not in specs:
            res.fail(f"{label} is owned by {item.get('owner_agent')!r}, which is not an agent", rel)
        if not item.get("paths") and state != "ready":
            res.fail(f"{label} declares no paths", rel)
        states = _history_states(item)
        if not states or states[0] != "ready":
            res.fail(f"{label} has no history starting at ready", rel)
            continue
        for a, b in zip(states, states[1:]):
            if b not in work.LEGAL.get(a, set()):
                res.fail(f"{label} went from {a} straight to {b}, which is not allowed", rel)
        if states[-1] != state:
            res.fail(f"{label} is {state} but its history ends at {states[-1]}", rel)
        if int(item.get("rework_rounds") or 0) != states.count("rework"):
            res.fail(f"{label} records {item.get('rework_rounds')} rework rounds but its history shows {states.count('rework')}", rel)
        handoff = item.get("handoff") or {}
        if state in ("in-review", "done") or "in-review" in states:
            if not str(handoff.get("done") or "").strip():
                res.fail(f"{label} was handed off without saying what was done", rel)
            evidence = handoff.get("evidence") or []
            if not evidence:
                res.fail(f"{label} was handed off with no evidence", rel)
            if not item.get("worktree"):  # evidence in an unmerged working copy cannot be seen from here
                for e in evidence:
                    if not ctx.src.exists(str(e)):
                        res.fail(f"{label} cites evidence {e}, which does not exist", rel)
        for h in item.get("history") or []:
            if h.get("state") in ("done", "rework") and h.get("by") in specs and not specs[h["by"]].get("reviews"):
                res.fail(f"{label} was moved to {h['state']} by {h['by']}, which is not a reviewing agent", rel)


@check("CK-PATH-LOCK", ("AGT-4",), "no two items in progress can edit the same file, migration, contract or shared component")
def ck_path_lock(ctx: Context, res: Result) -> None:
    for a, b, why in work.lock_conflicts(ctx):
        res.fail(f"{a['spec']}/{a['id']} ({a['state']}) and {b['spec']}/{b['id']} ({b['state']}): {why}", a["_file"])


def _changed(ctx: Context) -> list[str] | None:
    if ctx.options.get("changed_files") is not None:
        return list(ctx.options["changed_files"])
    if ctx.trusted.ref:
        p = subprocess.run(["git", "-C", str(ctx.src.root), "diff", "--name-only", ctx.trusted.ref], capture_output=True, text=True)
        if p.returncode:
            raise KitError(f"git diff against {ctx.trusted.ref} failed: {p.stderr.strip()[:160]}")
        q = subprocess.run(["git", "-C", str(ctx.src.root), "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True)
        return sorted({x for x in (p.stdout + q.stdout).splitlines() if x})
    return None


def _commits(ctx: Context) -> list[dict]:
    """Commits since the base that name a work item in a `Work-Item:` trailer, with the files each changed."""
    if ctx.options.get("commits") is not None:
        return list(ctx.options["commits"])
    if not ctx.trusted.ref:
        return []
    root = str(ctx.src.root)
    shas = subprocess.run(["git", "-C", root, "rev-list", "--no-merges", f"{ctx.trusted.ref}..HEAD"], capture_output=True, text=True).stdout.split()
    out = []
    for sha in shas:
        trailer = subprocess.run(["git", "-C", root, "show", "-s", "--format=%(trailers:key=Work-Item,valueonly)", sha],
                                 capture_output=True, text=True).stdout.strip()
        if not trailer:
            continue
        files = subprocess.run(["git", "-C", root, "diff-tree", "--no-commit-id", "--name-only", "-r", sha], capture_output=True, text=True).stdout.split("\n")
        out.append({"commit": sha[:10], "item": trailer.splitlines()[0].strip(), "files": [f for f in files if f]})
    return out


def _named(ctx: Context) -> list[str]:
    """The work item each commit since the base names in a `Work-Item:` trailer. One git call for the whole range.

    Git is asked only where the project root is a repository of its own: in a folder of another repository the commits
    would be that repository's.
    """
    if ctx.options.get("commits") is not None:
        return [str(c.get("item", "")) for c in ctx.options["commits"]]
    if not ctx.trusted.ref or not own_repository(ctx):
        return []
    p = subprocess.run(["git", "-C", str(ctx.src.root), "log", "--no-merges", "--format=%x00%(trailers:key=Work-Item,valueonly)",
                        f"{ctx.trusted.ref}..HEAD"], capture_output=True, text=True)
    if p.returncode:
        return []
    return [chunk.strip().splitlines()[0].strip() for chunk in p.stdout.split("\0") if chunk.strip()]  # the first trailer, as _commits reads it


def implementation(ctx: Context) -> dict[str, list[str]]:
    """For CK-GATE-RECORD: spec -> what shows that work on its tasks is in this tree.

    A work item that is done or was handed off, and a commit since the base that names one of the spec's work items.
    An item whose work is still in an isolated working copy is left out: its files are not here until it is integrated.
    """
    done: dict[str, list] = {}
    handed: dict[str, list] = {}
    for item in work.items(ctx):
        if item.get("worktree"):
            continue
        spec = item["_file"].split("/")[-2]
        if item.get("state") == "done":
            done.setdefault(spec, []).append(item.get("id"))
        elif item.get("handoff"):
            handed.setdefault(spec, []).append(item.get("id"))
    commits: dict[str, int] = {}
    for key in _named(ctx):
        spec = key.rsplit("/", 1)[0]
        commits[spec] = commits.get(spec, 0) + 1
    since = f"since {short_ref(str(ctx.trusted.ref))}" if ctx.trusted.ref else "in the range checked"
    out: dict[str, list[str]] = {}
    for spec in sorted(set(done) | set(handed) | set(commits)):
        out[spec] = ([f"work items done: {some(done[spec])}"] if spec in done else []) + \
                    ([f"work items handed off: {some(handed[spec])}"] if spec in handed else []) + \
                    ([f"{commits[spec]} commit(s) {since} name its work items"] if spec in commits else [])
    return out


@check("CK-PATH-DIFF", ("AGT-10",), "what agents changed stays inside their work items and their own write paths")
def ck_path_diff(ctx: Context, res: Result) -> None:
    specs = ag.load(ctx)
    all_items = work.items(ctx)
    by_key = {f"{i['spec']}/{i['id']}": i for i in all_items}
    for item in all_items:
        allowed = work.allowed_globs(ctx, item, specs)
        for f in (item.get("handoff") or {}).get("files") or []:
            if not work.match(str(f), allowed):
                res.fail(f"{item['spec']}/{item['id']} ({item.get('owner_agent')}) changed {f}, outside its paths", item["_file"])
    for c in _commits(ctx):
        item = by_key.get(c["item"])
        if item is None:
            res.fail(f"commit {c.get('commit', '?')} names work item {c['item']}, which does not exist")
            continue
        allowed = work.allowed_globs(ctx, item, specs)
        for f in c["files"]:
            if not work.kit_written(f) and not work.match(f, allowed):
                res.fail(f"commit {c.get('commit', '?')} for {c['item']} changed {f}, outside the item's paths", f)
    changed = _changed(ctx)
    if changed is None:
        res.notes.append("skipped the comparison with the change as a whole: no base ref or list of changed files was given")
        return
    done = {str(rec.get("spec")) for _, rec in decisions(ctx) if rec.get("gate") == "G5" and rec.get("decision") in ("approve", "approve-with-conditions")}
    active = [i for i in all_items if i["spec"] not in done]
    if not active:
        res.notes.append("no spec in flight is being worked through work items")
        return
    covered = [g for i in active for g in work.allowed_globs(ctx, i, specs)]
    for f in changed:
        if not f.startswith(EXEMPT) and not work.match(f, covered):
            res.fail(f"{f} changed, and no work item of a spec in flight declares it", f)


@check("CK-REWORK-LIMIT", ("AGT-6",), "no work item goes past two rework rounds; the disagreement goes to the accountable person")
def ck_rework_limit(ctx: Context, res: Result) -> None:
    roles = ctx.roles()
    defined = set((roles.get("roles") or {}).keys())
    people = {str(p.get("id")) for p in roles.get("people") or []}
    for item in work.items(ctx):
        label, rel = f"{item['spec']}/{item['id']}", item["_file"]
        rounds = max(int(item.get("rework_rounds") or 0), _history_states(item).count("rework"))
        if rounds > work.REWORK_LIMIT:
            res.fail(f"{label} went through {rounds} rework rounds; after {work.REWORK_LIMIT} it must be escalated, not returned again", rel)
        esc_rel = work.escalation_path(item["spec"], item["id"])
        escalated = item.get("blocked_reason") == "rework-limit" or len(item.get("findings") or []) > work.REWORK_LIMIT
        if not escalated:
            continue
        if not ctx.src.exists(esc_rel):
            res.fail(f"{label} reached the rework limit but has no escalation record", esc_rel)
            continue
        esc = ctx.src.yaml(esc_rel) or {}
        for side in ("author", "reviewer"):
            if not str((esc.get(side) or {}).get("position") or "").strip():
                res.fail(f"the escalation for {label} does not state the {side}'s position", esc_rel)
        if esc.get("accountable_role") not in defined:
            res.fail(f"the escalation for {label} names no accountable role", esc_rel)
        resolution = esc.get("resolution") or {}
        if item.get("state") != "blocked":
            if esc.get("status") != "resolved" or resolution.get("decided_by") not in people:
                res.fail(f"{label} moved on from its escalation without a decision by a person in roles.yml", esc_rel)
        elif esc.get("status") == "resolved" and resolution.get("decided_by") not in people:
            res.fail(f"the escalation for {label} is marked resolved by {resolution.get('decided_by')!r}, who is not a person in roles.yml", esc_rel)


@check("CK-BUDGET", ("AGT-7",), "every run has a budget of steps and time, and stops with a report when it is spent")
def ck_budget(ctx: Context, res: Result) -> None:
    for rel in ctx.src.files(work.RUNS_DIR):
        if not rel.endswith(".yml"):
            continue
        run = ctx.src.yaml(rel) or {}
        budget = run.get("budget") or {}
        label = f"run {run.get('spec')}/{run.get('id')}"
        if run.get("schema") != "agentic-run/1":
            res.fail("schema must be agentic-run/1", rel)
        if not budget.get("steps") or not budget.get("minutes"):
            res.fail(f"{label} has no budget of steps and minutes", rel)
            continue
        over = work.over_budget(run)
        if over and run.get("state") == "running":
            res.fail(f"{label} is past its budget ({over.replace('budget-', '')}: {run.get('steps')} steps, "
                     f"budget {budget.get('steps')} steps and {budget.get('minutes')} minutes) and was not stopped", rel)
        if run.get("state") == "stopped" and (not run.get("report") or not ctx.src.exists(str(run.get("report")))):
            res.fail(f"{label} stopped without a report", rel)
        if run.get("state") not in ("running", "stopped", "completed"):
            res.fail(f"{label} has unknown state {run.get('state')!r}", rel)


@check("CK-AUTHOR-NEQ-VERIFIER", ("AGT-9",), "the agent that authored an artifact never reviews or verifies it")
def ck_author_neq_verifier(ctx: Context, res: Result) -> None:
    specs = ag.load(ctx)
    for item in work.items(ctx):
        label, rel, owner = f"{item['spec']}/{item['id']}", item["_file"], item.get("owner_agent")
        if item.get("reviewer_agent") and item["reviewer_agent"] == owner:
            res.fail(f"{label} was authored and reviewed by {owner}", rel)
        for h in item.get("history") or []:
            if h.get("state") in ("done", "rework") and h.get("by") == owner:
                res.fail(f"{label} was moved to {h['state']} by its own author, {owner}", rel)
            if h.get("state") in ("done", "rework") and not str(h.get("by") or "").strip():
                # Nothing shows that this was not the author. `work review` refuses to write such a line; older records have it.
                res.fail(f"{label} was moved to {h['state']} by a reviewer the record does not name", rel)
        reviewer = specs.get(str(item.get("reviewer_agent")))
        author = specs.get(str(owner))
        if reviewer and author and reviewer.get("model_class") == author.get("model_class"):
            res.notes.append(f"{label}: reviewer and author use the same model class ({author.get('model_class')})")
    for spec in ctx.specs():
        for rel in ctx.src.files(f"specs/{spec}/verification"):
            if not rel.endswith("-inputs.yml"):
                continue
            body = ctx.src.yaml(rel) or {}
            if body.get("verifier") and body.get("verifier") == body.get("author"):
                res.fail(f"{body['verifier']} is named as both author and verifier", rel)


@check("CK-CRED", ("AGT-11",), "the credential agents use cannot approve, merge past protection, publish or deploy")
def ck_cred(ctx: Context, res: Result) -> None:
    adapter = adapters.enforcement(ctx)
    cred = adapter.agent_credential()
    perms = cred.get("permissions") or {}
    who = cred.get("identity") or "the agent credential"
    rel = f"{KIT_DIR}/kit.yml"
    for level in ("admin", "maintain"):
        if perms.get(level):
            res.fail(f"{who} has {level} permission: it can change branch protection, bypass required reviews and merge", rel)
    setup = {s.get("item"): s.get("status") for s in adapter.setup_report()}
    if perms.get("push") and setup.get("pull request reviews required") != "pass":
        res.fail(f"{who} can push, and the default branch does not require pull request reviews: it can change the default branch alone", rel)
    for scope in cred.get("scopes") or []:
        if scope in DANGEROUS_SCOPES:
            res.fail(f"{who} holds the {scope} scope, which lets it publish, deploy, rewrite workflows or administer", rel)
    holders = {p.lower(): roles for role, people in people_by_role(ctx.roles()).items() for p in people for roles in [role]}
    if str(who).lower() in holders:
        res.fail(f"{who} is listed in roles.yml as a person: an agent identity must not hold an approving role", f"{KIT_DIR}/roles.yml")
    if cred.get("account_type") and cred["account_type"] not in ("User", "Bot"):
        res.notes.append(f"{who} is a {cred['account_type']} account")
    if not cred.get("scopes"):
        res.notes.append("the credential reports no scopes (fine-grained and app tokens do not); only repository permissions were checked")
    res.notes.append("this covers the credential the kit runs with; it cannot see other credentials on the machine")


@check("CK-GOLDEN", ("AGT-8", "AGT-13", "ADP-12"), "golden tasks pass in parallel and sequential mode, and every seeded defect is caught")
def ck_golden(ctx: Context, res: Result) -> None:
    rel = golden.RESULTS
    required = bool((ag.team_config(ctx).get("golden") or {}).get("required"))
    if not ctx.src.exists(rel):
        if required:
            res.fail("kit.yml requires golden-task results and there are none", rel)
        else:
            res.notes.append("no golden-task results in this repository (they are produced in the kit's own CI, or where kit.yml requires them)")
        return
    doc = ctx.src.yaml(rel) or {}
    if doc.get("schema") != "agentic-golden/1":
        res.fail("schema must be agentic-golden/1", rel)
    if doc.get("agents_hash") != ag.specs_hash(ctx):
        res.fail("the results were produced with different agent specs; run the golden tasks again", rel)
    runs = {r.get("mode"): r for r in doc.get("runs") or [] if isinstance(r, dict)}
    for mode in ("parallel", "sequential"):
        run = runs.get(mode)
        if run is None:
            res.fail(f"there are no results for {mode} mode", rel)
            continue
        tasks = {t.get("id"): t for t in run.get("tasks") or []}
        for tid, spec in golden.TASKS.items():
            t = tasks.get(tid)
            if t is None or not t.get("completed"):
                res.fail(f"{mode}: golden task {tid} did not complete", rel)
                continue
            for gate in spec["gates"]:
                if gate not in (t.get("stopped_at") or []):
                    res.fail(f"{mode}: golden task {tid} did not stop at {gate}", rel)
            for expect in spec["expect"]:
                if expect not in (t.get("observed") or []):
                    res.fail(f"{mode}: golden task {tid} did not show: {expect}", rel)
        defects = {d.get("id"): d for d in run.get("defects") or []}
        for did in golden.DEFECTS:
            d = defects.get(did)
            if d is None or not d.get("caught"):
                res.fail(f"{mode}: seeded defect {did} was not caught", rel)
            elif d.get("caught_by") == d.get("author"):
                res.fail(f"{mode}: seeded defect {did} was 'caught' by its own author", rel)
        if run.get("driver") != "agent":
            res.notes.append(f"{mode}: results come from the {run.get('driver')} stand-in, not from a model")
