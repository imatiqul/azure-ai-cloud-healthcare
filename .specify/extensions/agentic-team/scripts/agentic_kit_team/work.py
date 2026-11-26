"""Work items, path locks, runs and the path guard (AGT-3 to AGT-7, AGT-10, TRC-6).

Shared state lives in the repository, not in any agent's context:

    .specify/agentic/work/<spec>/<item>.yml          one file per task, with its history and handoff
    .specify/agentic/work/<spec>/escalations/*.yml   a disagreement handed to the accountable person
    .specify/agentic/runs/<spec>/<run>.yml           one orchestrated run and its budget

State is always written in the primary checkout, so every working copy sees the same state.
"""
from __future__ import annotations

import datetime
import fnmatch
import hashlib
import re
import subprocess
from pathlib import Path

import yaml

from agentic_kit import decision_log
from agentic_kit.core import KIT_DIR, Context, KitError, Source, audit_append, unix_line_ends

from . import agents as ag

WORK_DIR = f"{KIT_DIR}/work"
RUNS_DIR = f"{KIT_DIR}/runs"
STATES = ("ready", "in-progress", "in-review", "rework", "blocked", "done")
LEGAL = {
    "ready": {"in-progress", "blocked"},
    "in-progress": {"in-review", "blocked", "ready"},
    "in-review": {"done", "rework", "blocked"},
    "rework": {"in-review", "blocked"},
    "blocked": {"ready", "in-progress", "in-review", "done"},
    "done": set(),
}
#: States in which an item holds the lock on its paths.
LOCKING = {"in-progress", "rework", "in-review"}
REWORK_LIMIT = 2
#: Written only by kit commands or by people, never by an agent's file tools.
PROTECTED = [f"{KIT_DIR}/decisions/*", f"{KIT_DIR}/audit/*", f"{KIT_DIR}/roles.yml", f"{KIT_DIR}/kit.yml", f"{KIT_DIR}/agents/*",
             f"{KIT_DIR}/_adapter/*", f"{KIT_DIR}/work/*", f"{KIT_DIR}/runs/*", f"{KIT_DIR}/golden/*", ".github/CODEOWNERS",
             f"{KIT_DIR}/context/*", f"{KIT_DIR}/tools.yml", f"{KIT_DIR}/product/*", f"{KIT_DIR}/intake/*", f"{KIT_DIR}/connect.yml",
             f"specs/*/{decision_log.LOG_NAME}"]  # the decision log: `decision` and a hand-off write it (DEC-18)
STATE_PATHS = (f"{KIT_DIR}/work/", f"{KIT_DIR}/runs/", f"{KIT_DIR}/audit/", f"{KIT_DIR}/context/")
WRITE_TOOLS = {"write", "edit", "multiedit", "notebookedit", "create", "str_replace", "str_replace_editor", "apply_patch", "insert",
               "create_file", "replace_string_in_file", "write_file", "edit_file", "delete_file"}


def now(ctx: Context | None = None) -> str:
    if ctx is not None and ctx.options.get("now"):
        return str(ctx.options["now"])
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _git(root: Path, *args: str, check: bool = True) -> str:
    p = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if p.returncode and check:
        raise KitError(f"git {' '.join(args)} failed: {p.stderr.strip()[:200]}")
    return p.stdout.strip() if p.returncode == 0 else ""


def is_git(root: Path) -> bool:
    return bool(_git(root, "rev-parse", "--is-inside-work-tree", check=False))


def primary_root(root: Path) -> Path:
    """The main checkout that a working copy belongs to; state is kept there."""
    root = Path(root).resolve()
    common = _git(root, "rev-parse", "--git-common-dir", check=False)
    if not common:
        return root
    common_path = (root / common).resolve() if not Path(common).is_absolute() else Path(common).resolve()
    return common_path.parent if common_path.name == ".git" else root


def context(root: Path, **options) -> Context:
    src = Source(primary_root(root))
    return Context(src, src, dict(options))


def match(path: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, g) or fnmatch.fnmatch(path, g.rstrip("/") + "/*") for g in globs)


# ── items ───────────────────────────────────────────────────────────────────────

def items(ctx: Context, spec: str | None = None) -> list[dict]:
    out = []
    for rel in ctx.src.files(WORK_DIR):
        parts = rel.split("/")
        if len(parts) != WORK_DIR.count("/") + 3 or not rel.endswith(".yml"):
            continue
        if spec and parts[-2] != spec:
            continue
        body = ctx.src.yaml(rel)
        if isinstance(body, dict):
            body["_file"] = rel
            out.append(body)
    return sorted(out, key=lambda i: (str(i.get("spec")), str(i.get("id"))))


def read_item(ctx: Context, spec: str, item: str) -> dict:
    rel = f"{WORK_DIR}/{spec}/{item}.yml"
    if not ctx.src.exists(rel):
        raise KitError(f"work item {spec}/{item} does not exist")
    body = ctx.src.yaml(rel) or {}
    body["_file"] = rel
    return body


def write_item(ctx: Context, item: dict) -> None:
    body = {k: v for k, v in item.items() if not k.startswith("_")}
    path = ctx.src.root / WORK_DIR / str(item["spec"]) / f"{item['id']}.yml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(body, sort_keys=False, width=120), encoding="utf-8", newline="\n")


def actor(ctx: Context, who: str) -> dict:
    specs = ag.load(ctx)
    if who in specs:
        return {"type": "agent", "id": who, "on_behalf_of": specs[who].get("supports_role")}
    return {"type": "human", "id": who}


def transition(ctx: Context, item: dict, to: str, by: str, **fields) -> dict:
    current = item.get("state")
    if to not in LEGAL.get(current, set()):
        raise KitError(f"{item['spec']}/{item['id']} cannot go from {current} to {to}")
    if not str(by or "").strip():
        # Without this the history and the audit log would say "a person with no name" did it.
        raise KitError(f"{item['spec']}/{item['id']} cannot go to {to}: the record must name who moved it")
    item["state"] = to
    item.setdefault("history", []).append({"state": to, "by": by, "at": now(ctx)})
    write_item(ctx, item)
    audit_append(ctx.src.root, str(item["spec"]), actor(ctx, by), f"work.{to}", spec=item["spec"], item=item["id"], **fields)
    return item


_TASK = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s*(T\d+)\b(.*)$")
_PATH = re.compile(r"`([^`\s]+/[^`\s]*)`|(?<![\w`/])((?:[\w.\-*]+/)+[\w.\-*]*)")


def parse_tasks(text: str, default_owner: str) -> list[dict]:
    """Work items for the open tasks of a Spec Kit task list. `[P]` marks a task that may run beside its neighbours."""
    out, since_serial, last_serial = [], [], None
    open_deps: dict[str, list[str]] = {}  # task -> the unfinished tasks it waits for; a finished task passes its own on
    for line in text.splitlines():
        m = _TASK.match(line)
        if not m:
            continue
        done, tid, rest = m.group(1) != " ", m.group(2), m.group(3)
        parallel = "[P]" in rest
        direct = ([last_serial] if last_serial else []) if parallel else ([last_serial] if last_serial else []) + since_serial
        deps = sorted({d for x in direct for d in open_deps.get(x, [x])} - {tid})
        open_deps[tid] = deps if done else [tid]
        if parallel:
            since_serial.append(tid)
        else:
            last_serial, since_serial = tid, []
        if done:
            continue
        owner = re.search(r"@([a-z0-9-]+)|owner:\s*([a-z0-9-]+)", rest)
        paths = _paths_in(rest)
        title = re.sub(r"\[[A-Za-z0-9]+\]|@[a-z0-9-]+|owner:\s*[a-z0-9-]+", "", rest).strip(" -:")
        out.append({"id": tid, "title": title[:160], "owner_agent": (owner.group(1) or owner.group(2)) if owner else default_owner,
                    "paths": paths, "depends_on": deps})
    return out


def _paths_in(text: str) -> list[str]:
    """The repository paths a task line names, in order, each once. A folder stands for everything in it."""
    paths = []
    for a, b in _PATH.findall(text):
        p = (a or b).rstrip(".,;:)")
        if p and not p.startswith(("http", "//")):
            paths.append(p + "*" if p.endswith("/") else p)
    return list(dict.fromkeys(paths))


def create_from_tasks(ctx: Context, spec: str, by: str = "orchestrator") -> list[dict]:
    rel = f"specs/{spec}/tasks.md"
    if not ctx.src.exists(rel):
        raise KitError(f"{rel} does not exist")
    default_owner = ag.team_config(ctx).get("default_implementer", "backend-implementer")
    existing = {i["id"] for i in items(ctx, spec)}
    made = []
    for t in parse_tasks(ctx.src.read(rel), default_owner):
        if t["id"] in existing:
            continue
        item = {"schema": "agentic-work/1", "id": t["id"], "spec": spec, "title": t["title"], "state": "ready",
                "owner_agent": t["owner_agent"], "paths": t["paths"], "depends_on": t["depends_on"], "rework_rounds": 0,
                "history": [{"state": "ready", "by": by, "at": now(ctx)}]}
        write_item(ctx, item)
        audit_append(ctx.src.root, spec, actor(ctx, by), "work.ready", spec=spec, item=t["id"], inputs=[rel])
        made.append(item)
    return made


def artifact_paths(ctx: Context, spec: str) -> list[str]:
    """QLT-1: the paths a spec's tasks name, finished or not, are the artifact its verifier checks."""
    paths = [p for item in items(ctx, spec) for p in item.get("paths") or []]
    rel = f"specs/{spec}/tasks.md"
    if ctx.src.exists(rel):
        for line in ctx.src.read(rel).splitlines():
            task = _TASK.match(line)
            if task:
                paths += _paths_in(task.group(3))
    return list(dict.fromkeys(paths))


# ── path locks (AGT-4) ──────────────────────────────────────────────────────────

def _prefix(glob: str) -> str:
    return re.split(r"[*?\[]", glob, maxsplit=1)[0]


def _suffix(glob: str) -> str:
    return re.split(r"[*?\]]", glob)[-1]


def globs_overlap(a: str, b: str, files: list[str]) -> bool:
    """Could two path patterns name the same file? Errs towards yes."""
    if a == b or any(fnmatch.fnmatch(f, a) and fnmatch.fnmatch(f, b) for f in files):
        return True
    wild_a, wild_b = _prefix(a) != a, _prefix(b) != b
    if not wild_a and not wild_b:
        return False
    if not wild_a:
        return fnmatch.fnmatch(a, b)
    if not wild_b:
        return fnmatch.fnmatch(b, a)
    pa, pb, sa, sb = _prefix(a), _prefix(b), _suffix(a), _suffix(b)
    if not (pa.startswith(pb) or pb.startswith(pa)):
        return False
    return not (sa and sb and not sa.endswith(sb) and not sb.endswith(sa))


def single_writer_nodes(ctx: Context) -> dict[str, list[str]]:
    """Nodes that allow one writer at a time (a store's migrations, a contract, a shared component) -> their paths."""
    try:
        from agentic_kit_system.mapmodel import CONTRACT_TYPES, DATA_TYPES, SHARED_TYPES, load_map
    except ImportError:
        return {}
    smap = load_map(ctx, required=False)
    if smap is None:
        return {}
    out: dict[str, list[str]] = {}
    for entry in smap.raw.get("index") or []:
        node = smap.nodes.get(entry.get("node")) or {}
        if node.get("type") in DATA_TYPES | CONTRACT_TYPES | SHARED_TYPES:
            out.setdefault(entry["node"], []).extend(entry.get("paths") or [])
    for nid, node in smap.nodes.items():
        if node.get("type") in DATA_TYPES and node.get("migrations"):
            out.setdefault(nid, []).extend(node["migrations"])
    return out


def lock_conflicts(ctx: Context, candidates: list[dict] | None = None) -> list[tuple[dict, dict, str]]:
    """(item, other item, why) for every pair of lock-holding items that could edit the same thing."""
    holders = [i for i in items(ctx) if i.get("state") in LOCKING]
    pool = holders if candidates is None else candidates
    files = ctx.src.files()
    nodes = single_writer_nodes(ctx)

    def node_ids(item: dict) -> set[str]:
        return {nid for nid, globs in nodes.items() for g in globs for p in item.get("paths") or [] if globs_overlap(str(p), g, files)}

    out, seen = [], set()
    for a in pool:
        for b in holders:
            key = tuple(sorted([f"{a['spec']}/{a['id']}", f"{b['spec']}/{b['id']}"]))
            if key[0] == key[1] or key in seen:
                continue
            why = ""
            for pa in a.get("paths") or []:
                for pb in b.get("paths") or []:
                    if not why and globs_overlap(str(pa), str(pb), files):
                        why = f"both claim {pa}" if pa == pb else f"{pa} overlaps {pb}"
            shared = sorted(node_ids(a) & node_ids(b))
            if not why and shared:
                why = f"both write {shared[0]}, which allows one writer at a time"
            if why:
                seen.add(key)
                out.append((a, b, why))
    return out


# ── the working life of an item ─────────────────────────────────────────────────

def _file_hash(path: Path) -> str:
    return hashlib.sha256(unix_line_ends(path.read_bytes())).hexdigest() if path.is_file() else ""


def kit_written(path: str) -> bool:
    """Is this a file the kit's own commands write, so that a change to it is not the work of whoever holds a work item?

    The records under STATE_PATHS, and a spec's decision log: a hand-off puts its questions there itself (DEC-18)."""
    return path.startswith(STATE_PATHS) or decision_log.is_log(path)


def _dirty(where: Path, base: str) -> list[str]:
    changed = _git(where, "diff", "--name-only", base).splitlines() + _git(where, "ls-files", "--others", "--exclude-standard").splitlines()
    return sorted({f for f in changed if f and not kit_written(f)})


def workdir(ctx: Context, item: dict) -> Path:
    return (ctx.src.root / item["worktree"]).resolve() if item.get("worktree") else ctx.src.root


def claim(ctx: Context, spec: str, item_id: str, agent: str, worktree: bool = False) -> dict:
    item = read_item(ctx, spec, item_id)
    if item.get("state") not in ("ready", "rework", "blocked"):
        raise KitError(f"{spec}/{item_id} is {item.get('state')}; only a ready item can be claimed")
    if item.get("owner_agent") and item["owner_agent"] != agent:
        raise KitError(f"{spec}/{item_id} is assigned to {item['owner_agent']}, not {agent}")
    if not item.get("paths"):
        raise KitError(f"{spec}/{item_id} declares no paths; the Orchestrator must say which files it may change")
    if item.get("state") == "blocked" and item.get("blocked_reason") == "rework-limit":
        rel = escalation_path(spec, item_id)
        esc = (ctx.src.yaml(rel) or {}) if ctx.src.exists(rel) else {}
        people = {str(p.get("id")) for p in ctx.roles().get("people") or []}
        if esc.get("status") != "resolved" or (esc.get("resolution") or {}).get("decided_by") not in people:
            raise KitError(f"{spec}/{item_id} is escalated; a person in roles.yml must record a decision in {rel} before work resumes")
    by_id = {i["id"]: i for i in items(ctx, spec)}
    waiting = [d for d in item.get("depends_on") or [] if (by_id.get(d) or {}).get("state") != "done"]
    if waiting:
        raise KitError(f"{spec}/{item_id} depends on {', '.join(waiting)}, which {'is' if len(waiting) == 1 else 'are'} not done")
    for _, other, why in lock_conflicts(ctx, [item]):
        raise KitError(f"{spec}/{item_id} cannot start while {other['spec']}/{other['id']} is {other['state']}: {why}")
    item["owner_agent"] = agent
    if item.get("state") == "rework":
        # The author already holds it. In a shared working copy, others have written since the first claim: other
        # items were handed off, reviewers wrote their findings. What is there now is not this round's work.
        if item.get("base") and not item.get("worktree") and is_git(ctx.src.root):
            item["dirty_at_claim"] = {f: _file_hash(ctx.src.root / f) for f in _dirty(ctx.src.root, item["base"])}
            write_item(ctx, item)
        return item
    from . import context as pack
    item["context"] = pack.write(ctx, spec, item_id)  # AGT-19: what the agent is told is built by the kit and recorded with the claim
    root = ctx.src.root
    if is_git(root):
        item["base"] = _git(root, "rev-parse", "HEAD")
        if worktree:
            target = root.parent / f"{root.name}.worktrees" / f"{spec}-{item_id}"
            branch = f"work/{spec}/{item_id}"
            _git(root, "worktree", "add", "-b", branch, str(target), "HEAD")
            item["worktree"], item["branch"] = f"../{root.name}.worktrees/{spec}-{item_id}", branch
        else:
            item["dirty_at_claim"] = {f: _file_hash(root / f) for f in _dirty(root, item["base"])}
    elif worktree:
        raise KitError("an isolated working copy needs a git repository")
    return transition(ctx, item, "in-progress", agent)


def allowed_globs(ctx: Context, item: dict, specs: dict[str, dict] | None = None) -> list[str]:
    """Where the holder of an item may write: the item's paths, plus the agent's own fixed paths."""
    specs = specs if specs is not None else ag.load(ctx)
    agent = specs.get(str(item.get("owner_agent"))) or {}
    fixed = [w for w in agent.get("write_paths") or [f"specs/{item['spec']}/evidence/*"] if w != "{task.paths}"]
    return [str(p) for p in item.get("paths") or []] + fixed


def changed_files(ctx: Context, item: dict) -> list[str] | None:
    """Files the item's holder changed since it was claimed, or None when that cannot be known."""
    where = workdir(ctx, item)
    if not item.get("base") or not is_git(where):
        return None
    before = item.get("dirty_at_claim") or {}
    return [f for f in _dirty(where, item["base"]) if before.get(f) != _file_hash(where / f)]


def handoff(ctx: Context, spec: str, item_id: str, agent: str, done: str, evidence: list[str], questions: list[str] | None = None) -> dict:
    item = read_item(ctx, spec, item_id)
    if item.get("state") not in ("in-progress", "rework"):
        raise KitError(f"{spec}/{item_id} is {item.get('state')}; only work in progress can be handed off")
    if item.get("owner_agent") != agent:
        raise KitError(f"{spec}/{item_id} is held by {item.get('owner_agent')}, not {agent}")
    if not done.strip():
        raise KitError("a handoff says what was done")
    where = workdir(ctx, item)
    missing = [e for e in evidence if not (where / e).is_file() and not (ctx.src.root / e).is_file()]
    if not evidence or missing:
        raise KitError("a handoff names evidence files that exist" + (f"; missing: {', '.join(missing)}" if missing else ""))
    files = changed_files(ctx, item)
    if files is not None:
        outside = [f for f in files if not match(f, allowed_globs(ctx, item))]
        if outside:
            raise KitError(f"{spec}/{item_id} changed files outside its declared paths: {', '.join(outside[:8])}")
        if item.get("worktree") and _git(where, "status", "--porcelain"):
            _git(where, "add", "-A")
            _git(where, "-c", "user.name=agentic-kit", "-c", f"user.email={agent}@agents.invalid", "commit", "-q", "-m",
                 f"{item_id}: {done.strip()[:60]}\n\nWork-Item: {spec}/{item_id}\nAgent: {agent}")
    # Each open question becomes a proposal in the spec's decision log, once, for a person to decide (DEC-18). Where the log
    # cannot be read this stops the hand-off, before anything is written into the work item.
    asked = decision_log.propose(ctx, spec, questions, by=agent, affects=[item_id], actor=actor(ctx, agent)) if questions else []
    item["handoff"] = {"done": done.strip(), "evidence": list(evidence), "open_questions": list(questions or []), "files": files or []}
    item = transition(ctx, item, "in-review", agent, outputs=(files or [])[:50])
    if asked:
        item["_questions"] = [f"{e['id']} ({e['state']})" for e in asked]  # for the command to say; a key that starts with _ is not written
    return item


def escalation_path(spec: str, item_id: str) -> str:
    return f"{WORK_DIR}/{spec}/escalations/{item_id}.yml"


def review(ctx: Context, spec: str, item_id: str, by: str, accept: bool, finding: str = "") -> str:
    """'done', 'rework' or 'escalated'."""
    item = read_item(ctx, spec, item_id)
    by = str(by or "").strip()
    if not by:
        raise KitError("a review must name who made it: give --by <reviewing agent>")
    if item.get("state") != "in-review":
        raise KitError(f"{spec}/{item_id} is {item.get('state')}; only an item in review can be reviewed")
    if by == item.get("owner_agent"):
        raise KitError(f"{by} authored {spec}/{item_id} and cannot review it")
    specs = ag.load(ctx)
    if by in specs and not specs[by].get("reviews"):
        raise KitError(f"{by} is not a reviewing agent")
    if by not in specs and by not in {str(p.get("id")) for p in ctx.roles().get("people") or []}:
        # A name the project does not know would be recorded as a person. A mistyped agent name is the likely case.
        raise KitError(f"{by} is neither an agent of the team nor a person in the roles file")
    item["reviewer_agent"] = by
    if accept:
        transition(ctx, item, "done", by)
        return "done"
    if not finding.strip():
        raise KitError("returning an item needs a finding: say what must change")
    item.setdefault("findings", []).append({"round": int(item.get("rework_rounds") or 0) + 1, "by": by, "text": finding.strip()})
    if int(item.get("rework_rounds") or 0) >= REWORK_LIMIT:
        owner_role = ""
        if ctx.src.exists(f"specs/{spec}/spec.md"):
            from agentic_kit.core import front_matter
            owner_role = front_matter(ctx.src.read(f"specs/{spec}/spec.md")).get("owner_role", "")
        path = ctx.src.root / escalation_path(spec, item_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump({
            "schema": "agentic-escalation/1", "spec": spec, "item": item_id, "reason": "rework-limit",
            "accountable_role": owner_role or (specs.get(str(item.get("owner_agent"))) or {}).get("supports_role", ""),
            "author": {"agent": item.get("owner_agent"), "position": (item.get("handoff") or {}).get("done", "")},
            "reviewer": {"agent": by, "position": finding.strip()},
            "rounds": [f for f in item.get("findings") or []], "status": "open", "resolution": None,
        }, sort_keys=False, width=120), encoding="utf-8", newline="\n")
        item["blocked_reason"] = "rework-limit"
        transition(ctx, item, "blocked", by, outputs=[escalation_path(spec, item_id)])
        return "escalated"
    item["rework_rounds"] = int(item.get("rework_rounds") or 0) + 1
    transition(ctx, item, "rework", by)
    return "rework"


def integrate(ctx: Context, spec: str, item_id: str) -> str:
    """Merge a finished item's working copy into the spec branch of the primary checkout."""
    item = read_item(ctx, spec, item_id)
    if item.get("state") != "done":
        raise KitError(f"{spec}/{item_id} is {item.get('state')}; only a done item is integrated")
    if not item.get("branch"):
        return "nothing to integrate: the item was worked in the primary checkout"
    root = ctx.src.root
    default = str((ctx.kit().get("enforcement") or {}).get("default_branch") or "main")
    current = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    if current in (default, "main", "master"):
        raise KitError(f"the primary checkout is on {current}; work is integrated into the spec's feature branch, never into the default branch")
    _git(root, "-c", "user.name=agentic-kit", "-c", "user.email=orchestrator@agents.invalid", "merge", "--no-ff", "-q", "-m",
         f"Integrate {spec}/{item_id}\n\nWork-Item: {spec}/{item_id}", item["branch"])
    _git(root, "worktree", "remove", "--force", str(workdir(ctx, item)), check=False)
    item["integrated"] = True
    item.pop("worktree", None)
    write_item(ctx, item)
    return f"merged {item['branch']}"


def ready(ctx: Context, spec: str) -> list[list[dict]]:
    """Ready items whose dependencies are done, grouped so that no group holds two items that could collide."""
    all_items = items(ctx, spec)
    done = {i["id"] for i in all_items if i.get("state") == "done"}
    open_items = [i for i in all_items if i.get("state") == "ready" and set(i.get("depends_on") or []) <= done]
    busy = {f"{a['spec']}/{a['id']}" for a, _, _ in lock_conflicts(ctx, open_items)}
    files = ctx.src.files()
    nodes = single_writer_nodes(ctx)
    groups: list[list[dict]] = []
    for item in open_items:
        if f"{item['spec']}/{item['id']}" in busy:
            continue
        for group in groups:
            clash = any(globs_overlap(str(pa), str(pb), files) for other in group for pa in item.get("paths") or [] for pb in other.get("paths") or [])
            for globs in nodes.values():
                hit = lambda it: any(globs_overlap(str(p), g, files) for p in it.get("paths") or [] for g in globs)  # noqa: E731
                clash = clash or (hit(item) and any(hit(o) for o in group))
            if not clash:
                group.append(item)
                break
        else:
            groups.append([item])
    return groups


# ── runs and budgets (AGT-7, TRC-6) ─────────────────────────────────────────────

def run_path(spec: str, run: str) -> str:
    return f"{RUNS_DIR}/{spec}/{run}.yml"


def read_run(ctx: Context, spec: str, run: str) -> dict:
    rel = run_path(spec, run)
    if not ctx.src.exists(rel):
        raise KitError(f"run {spec}/{run} does not exist")
    return ctx.src.yaml(rel) or {}


def _write_run(ctx: Context, run: dict) -> None:
    path = ctx.src.root / run_path(run["spec"], run["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(run, sort_keys=False), encoding="utf-8", newline="\n")


def run_start(ctx: Context, spec: str, mode: str, budget: dict | None = None) -> dict:
    budget = dict(budget or ag.team_config(ctx)["budget"])
    if not budget.get("steps") or not budget.get("minutes"):
        raise KitError("a run needs a budget of steps and minutes")
    n = len([f for f in ctx.src.files(f"{RUNS_DIR}/{spec}") if f.endswith(".yml")]) + 1
    run = {"schema": "agentic-run/1", "id": f"r{n}", "spec": spec, "mode": mode, "budget": budget, "steps": 0,
           "started": now(ctx), "last": now(ctx), "state": "running", "stop_reason": None, "report": None}
    _write_run(ctx, run)
    audit_append(ctx.src.root, spec, {"type": "kit", "id": "agentic-team"}, "run.start", spec=spec, run=run["id"], mode=mode)
    return run


def _minutes(a: str, b: str) -> float:
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return (datetime.datetime.strptime(b, fmt) - datetime.datetime.strptime(a, fmt)).total_seconds() / 60


def over_budget(run: dict) -> str:
    budget = run.get("budget") or {}
    if int(run.get("steps") or 0) > int(budget.get("steps") or 0):
        return "budget-steps"
    try:
        if _minutes(str(run.get("started")), str(run.get("last"))) > float(budget.get("minutes") or 0):
            return "budget-minutes"
    except ValueError:
        return "unreadable-times"
    if budget.get("cost") is not None and float(run.get("cost") or 0) > float(budget["cost"]):
        return "budget-cost"
    return ""


def run_stop(ctx: Context, spec: str, run_id: str, reason: str) -> dict:
    run = read_run(ctx, spec, run_id)
    run["state"], run["stop_reason"], run["last"] = ("completed" if reason == "completed" else "stopped"), reason, now(ctx)
    open_items = [f"- {i['id']} ({i.get('state')}, {i.get('owner_agent')}): {i.get('title', '')}" for i in items(ctx, spec) if i.get("state") != "done"]
    report = f"{RUNS_DIR}/{spec}/{run_id}-report.md"
    (ctx.src.root / report).write_text(
        f"# Run {run_id} of {spec}: {run['state']}\n\n- Reason: {reason}\n- Steps: {run['steps']} of {run['budget'].get('steps')}\n"
        f"- Started {run['started']}, stopped {run['last']} (budget {run['budget'].get('minutes')} minutes)\n\n## Work not done\n"
        + ("\n".join(open_items) or "Nothing: every work item is done.") + "\n", encoding="utf-8", newline="\n")
    run["report"] = report
    _write_run(ctx, run)
    audit_append(ctx.src.root, spec, {"type": "kit", "id": "agentic-team"}, "run.stop", spec=spec, run=run_id, reason=reason, outputs=[report])
    return run


def run_step(ctx: Context, spec: str, run_id: str, agent: str, action: str, inputs: list[str] | None = None,
             outputs: list[str] | None = None, model: dict | None = None, tools: list[str] | None = None,
             cost: float | None = None, seconds: float | None = None, gate: str | None = None) -> tuple[dict, str]:
    """Record one agent step (AGT-17). Returns the run and, when the budget is spent, the reason it was stopped.

    The kit fills in what it can see for itself: the hash of the agent specs, the hash of each input, the tools the
    agent's spec allows, and the time since the last step. Which model ran and what the step cost are known only to
    the runtime; they are recorded as given, and CK-RUN-RECORD fails a step that does not say.
    """
    import hashlib
    run = read_run(ctx, spec, run_id)
    if run.get("state") != "running":
        raise KitError(f"run {spec}/{run_id} is {run.get('state')} ({run.get('stop_reason')}); start a new run")
    stamp = now(ctx)
    try:
        elapsed = max(0.0, round(_minutes(str(run.get("last")), stamp) * 60, 1))
    except ValueError:
        elapsed = 0.0
    hashes = {}
    for rel in inputs or []:
        hashes[str(rel)] = "sha256:" + hashlib.sha256(ctx.src.read_bytes(str(rel))).hexdigest() if ctx.src.exists(str(rel)) else "missing"
    declared = (ag.load(ctx).get(agent) or {}).get("tools")
    record = {"inputs": list(inputs or []), "input_hashes": hashes, "outputs": list(outputs or []), "agents_hash": ag.specs_hash(ctx),
              "model": dict(model) if model else None,
              "tools": list(tools) if tools is not None else list(declared or []), "tools_source": "reported" if tools is not None else "declared",
              "cost": None if cost is None else round(float(cost), 6), "seconds": elapsed if seconds is None else round(float(seconds), 1)}
    if gate:
        record["gate"] = gate
    run["steps"], run["last"] = int(run.get("steps") or 0) + 1, stamp
    if record["cost"] is not None:
        run["cost"] = round(float(run.get("cost") or 0) + record["cost"], 6)
    _write_run(ctx, run)
    audit_append(ctx.src.root, spec, actor(ctx, agent), f"agent.{action}", spec=spec, run=run_id, **record)
    reason = over_budget(run)
    if reason:
        return run_stop(ctx, spec, run_id, reason), reason
    return run, ""


# ── the path guard (AGT-10, where the runtime has a pre-tool-use event) ─────────

def _toplevel(cwd: Path) -> Path:
    top = _git(cwd, "rev-parse", "--show-toplevel", check=False)
    return Path(top).resolve() if top else cwd.resolve()


def guard(cwd: Path, payload: dict) -> tuple[bool, str]:
    """Decide one tool call. (allowed, reason). Only file-writing tools are judged; a shell command is not parsed."""
    tool = str(payload.get("tool_name") or payload.get("toolName") or payload.get("tool") or "")
    if tool.lower() not in WRITE_TOOLS:
        return True, ""
    args = payload.get("tool_input") or payload.get("toolArgs") or payload.get("input") or {}
    if isinstance(args, str):
        try:
            import json
            args = json.loads(args)
        except ValueError:
            args = {}
    target = next((args[k] for k in ("file_path", "path", "notebook_path", "filePath", "target_file") if isinstance(args, dict) and args.get(k)), None)
    if not target:
        return True, ""
    top = _toplevel(Path(payload.get("cwd") or cwd))
    primary = primary_root(top)
    if not (primary / KIT_DIR / "kit.yml").is_file():
        return True, ""
    ctx = context(primary)
    full = (top / target).resolve() if not Path(str(target)).is_absolute() else Path(str(target)).resolve()
    specs = ag.load(ctx)
    agent = str(payload.get("agent_type") or "")
    mine = [i for i in items(ctx) if i.get("state") in ("in-progress", "rework")
            and (workdir(ctx, i) == top if i.get("worktree") else top == primary)]
    try:
        rel = full.relative_to(top).as_posix()
    except ValueError:
        if mine or agent in specs:
            return False, f"{target} is outside the working copy"
        return True, ""
    if match(rel, PROTECTED):
        return False, f"{rel} is written only by kit commands or by a person, never by an agent's file tools"
    if agent in specs:
        held = [p for i in mine if i.get("owner_agent") == agent for p in i.get("paths") or []]
        allowed = [w for w in specs[agent].get("write_paths") or [] if w != "{task.paths}"] + [str(p) for p in held]
        if not match(rel, allowed):
            return False, f"{agent} may not write {rel}: it is outside the agent's write paths and the work item it holds"
        return True, ""
    if mine:
        allowed = [g for i in mine for g in allowed_globs(ctx, i, specs)]
        if not match(rel, allowed):
            names = ", ".join(f"{i['spec']}/{i['id']}" for i in mine)
            return False, f"{rel} is outside the declared paths of the work in progress ({names})"
    return True, ""
