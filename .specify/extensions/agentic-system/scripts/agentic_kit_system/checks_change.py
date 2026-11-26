"""Change-pack checks for slice 0.2, part 2 (CHG-1 to CHG-15, CHG-18).

Three kinds of rule live here:

* plan rules read what a spec declares (data-change plan, rollout order);
* change rules compare the tree with its base (the base branch in CI) and ask for evidence that is
  bound by hash to what changed;
* standing rules hold for the whole map. Where an existing codebase will not meet one on day one,
  the unmet items are reported as findings that a waiver or the adoption baseline can carry (GOV-21).

Nothing here connects to a database, a registry or any other service.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import re

from agentic_kit.checks_gov import active_waivers, as_date, decisions, report_unwaived, spec_front
from agentic_kit.core import KIT_DIR, Context, KitError, Result, check, front_matter

from . import contracts as fmt
from . import engines as eng
from .checks_map import SYS, approved_gates, changed_files, touches
from .mapmodel import CONTRACT_TYPES, DATA_TYPES, MAP_PATH, SHARED_TYPES, SystemMap, load_map, restricted_classes

EXTERNAL_TYPES = {"external-application", "external-service"}
DEPLOYABLE = {"service", "frontend", "data-store", "schema", "infrastructure", "ai-component", "event-bus"}
USES = {"calls", "reads", "writes", "subscribes", "authenticates-via"}
DEP_FIELDS = ["contract", "version", "auth", "data", "availability", "timeout", "retry", "circuit_breaker", "user_failure", "test_double"]
PLAN = "data-change-plan.md"
MIGRATION_RUN = "evidence/migration-run.yml"
CONSUMER_RUNS = "evidence/consumer-runs.yml"
SBOM = "release/sbom.cdx.json"
ROLLOUT = "rollout.yml"

#: rule id -> the check that reports it. Waivers and the adoption baseline cover these like any suppression.
RULES = {
    "pin-action": "CK-PIN", "pin-image": "CK-PIN", "pin-digest": "CK-PIN", "pin-package": "CK-PIN",
    "store-engine-unknown": "CK-MIGRATION-ENGINE", "migration-foreign-engine": "CK-MIGRATION-ENGINE",
    "migration-warning-suppress": "CK-MIGRATION-DRIFT",
    "unversioned-contract": "CK-CONTRACT-VERSION", "contract-untested": "CK-CONTRACT-CONSUMER",
    "contract-drift-undeclared": "CK-CONTRACT-DRIFT", "unversioned-shared": "CK-SHARED-SEMVER",
    "external-dep-incomplete": "CK-EXTERNAL-DEP",
}
MIGRATION_WARNING = (["*.cs", "*.json", "*.yml", "*.yaml", "*.py", "*.ts", "*.js"],
                     r"Ignore\([^)]*PendingModelChangesWarning|PendingModelChangesWarning\s*[,)]\s*(?:WarningBehavior\.)?Ignore")


# ── shared helpers ──────────────────────────────────────────────────────────────

def has_base(ctx: Context) -> bool:
    return ctx.options.get("base_files") is not None or bool(ctx.trusted.ref)


def base_text(ctx: Context, rel: str) -> str | None:
    """The file as it was before this change, or None if it did not exist (or there is no base to compare with)."""
    given = ctx.options.get("base_files")
    if given is not None:
        return given.get(rel)
    if ctx.trusted.ref and ctx.trusted.exists(rel):
        return ctx.trusted.read(rel)
    return None


def sections(text: str) -> dict[str, str]:
    """Markdown heading -> the text under it, up to the next heading of any level."""
    out: dict[str, str] = {}
    current = None
    body = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", text, flags=re.S)
    for line in body.splitlines():
        m = re.match(r"#{1,6}\s+(.*?)\s*#*\s*$", line)
        if m:
            current = m.group(1).strip()
            out.setdefault(current, "")
        elif current is not None:
            out[current] += line + "\n"
    return out


def _empty(body: str | None) -> bool:
    text = re.sub(r"<!--.*?-->", "", body or "", flags=re.S).strip()
    return not text or bool(re.fullmatch(r"(?i)(tbd|todo|to do|n/?a|\?+|\[[^\]]*\]|<[^>]*>|_+|\.+)", text))


def plan_specs(ctx: Context) -> list[str]:
    return [s for s in ctx.specs() if ctx.src.exists(f"specs/{s}/plan.md")]


def active_specs(ctx: Context) -> list[str]:
    """Specs this change belongs to: those whose files it edits, otherwise every spec not yet approved at G5."""
    changed = changed_files(ctx) or []
    done = approved_gates(ctx)
    return [s for s in ctx.specs() if any(c.startswith(f"specs/{s}/") for c in changed)] or \
           [s for s in ctx.specs() if "G5" not in done.get(s, set())]


def store_of(smap: SystemMap, nid: str) -> dict:
    """The data store a data node lives in: itself, or the store that owns it."""
    node = smap.nodes.get(nid) or {}
    if node.get("engine") or node.get("type") == "data-store":
        return node
    for e in smap.edges:
        if e.get("to") == nid and e.get("rel") == "owns" and (smap.nodes.get(e["from"]) or {}).get("type") in DATA_TYPES:
            return store_of(smap, e["from"])
    return node


def users_of(smap: SystemMap, nid: str, rels: set[str]) -> list[str]:
    """Nodes with one of `rels` to the node or to anything it owns."""
    targets = {nid} | set(smap.owned_by(nid))
    return sorted({e["from"] for e in smap.edges if e.get("to") in targets and e.get("rel") in rels and e.get("from") != nid})


def node_files(ctx: Context, smap: SystemMap, nid: str) -> list[str]:
    globs = [g for entry in smap.raw.get("index") or [] if entry.get("node") == nid for g in entry.get("paths") or []]
    return [f for f in ctx.src.files() if any(fnmatch.fnmatch(f, g) for g in globs)] if globs else []


def content_hash(ctx: Context, files: list[str]) -> str:
    h = hashlib.sha256()
    for rel in sorted(set(files)):
        h.update(rel.encode() + b"\0" + hashlib.sha256(ctx.src.read_bytes(rel)).hexdigest().encode() + b"\n")
    return "sha256:" + h.hexdigest()


def contract_file(node: dict) -> str:
    path = node.get("path") or (node.get("evidence") if node.get("origin") == "derived" else "")
    return re.split(r"[:;(\s]", str(path).strip(), maxsplit=1)[0] if path else ""


def subject_hash(ctx: Context, smap: SystemMap, nid: str) -> str:
    """What a run was performed against: the contract file, or every file of a shared component."""
    node = smap.nodes[nid]
    if node.get("type") in CONTRACT_TYPES and contract_file(node) and ctx.src.exists(contract_file(node)):
        return content_hash(ctx, [contract_file(node)])
    return content_hash(ctx, node_files(ctx, smap, nid))


def runs(ctx: Context, spec: str) -> list[dict]:
    rel = f"specs/{spec}/{CONSUMER_RUNS}"
    if not ctx.src.exists(rel):
        return []
    return [r for r in ((ctx.src.yaml(rel) or {}).get("runs") or []) if isinstance(r, dict)]


def passed(ctx: Context, specs: list[str], kind: str, provider: str, consumer: str, subject: str) -> str:
    """'' when a passing run for the current subject exists, otherwise why not."""
    found = [r for s in specs for r in runs(ctx, s)
             if r.get("kind") == kind and r.get("provider") == provider and r.get("consumer") == consumer]
    if not found:
        return "did not run"
    current = [r for r in found if r.get("subject") == subject]
    if not current:
        return "ran against an earlier version, not the current one"
    return "" if any(r.get("result") == "pass" for r in current) else "failed"


def changed_nodes(ctx: Context, smap: SystemMap) -> dict[str, list[str]] | None:
    changed = changed_files(ctx)
    if changed is None:
        return None
    out: dict[str, list[str]] = {}
    for c in changed:
        node = smap.node_for(c)
        if node:
            out.setdefault(node, []).append(c)
    return out


def _contract(ctx: Context, node: dict):
    """(path, current text, adapter) for a contract node that has a file; adapter is None when no format matches."""
    path = contract_file(node)
    if not path or not ctx.src.exists(path):
        return path, None, None
    text = ctx.src.read(path)
    return path, text, fmt.adapter_for(path, text)


def _contract_changed(ctx: Context, node: dict) -> tuple[str, str | None, str | None, object]:
    """(path, old text, new text, adapter); old is None when the contract is new or there is no base."""
    path, text, adapter = _contract(ctx, node)
    old = base_text(ctx, path) if path else None
    if old is None or text is None:
        return path, None, text, adapter
    same = (adapter.normal(old) == adapter.normal(text)) if adapter else (old.strip() == text.strip())
    return path, (None if same else old), text, adapter


def _version_of(ctx: Context, node: dict, text: str | None = None) -> str:
    vf = node.get("version_file")
    if vf:
        body = text if text is not None else (ctx.src.read(vf) if ctx.src.exists(vf) else "")
        return fmt.read_version(vf, body)
    return str(node.get("version") or "")


# ── findings that waivers and the baseline can cover ────────────────────────────

FLOATING_TAGS = ("latest", "stable", "edge", "main", "master", "nightly", "lts", "current", "dev")
ASPIRE_CONTAINER = re.compile(r'\bAddContainer\(\s*"[^"]*"\s*,\s*"([^"]+)"\s*(?:,\s*"([^"]*)"\s*)?\)')
ASPIRE_TAG = re.compile(r'\.WithImageTag\(\s*"([^"]*)"\s*\)')


def _image_problem(ref: str, want_digest: bool) -> tuple[str, str] | None:
    ref = ref.strip().strip("\"'")
    if not ref or any(x in ref for x in ("${", "{{", "$(")) or ref.startswith("$") or ref == "scratch":
        return None
    if "@sha256:" in ref:
        return None
    last = ref.rsplit("/", 1)[-1]
    tag = last.split(":", 1)[1] if ":" in last else ""
    low = tag.lower()
    # "2022-latest" moves as much as "latest" does.
    if not tag or low in FLOATING_TAGS or low.endswith("-latest") or low.startswith("latest-"):
        return "pin-image", f"{ref} floats: {'no tag' if not tag else 'tag ' + tag}"
    return ("pin-digest", f"{ref} has a tag but no digest") if want_digest else None


def _host_images(text: str) -> list[tuple[int, str, bool]]:
    """(line, image reference, has a digest) for each container a .NET Aspire application host starts with literal arguments.

    Read: AddContainer("name", "image"[, "tag"]) and, chained on the same statement, WithImageTag("tag") and WithImageSHA256("...").
    Anything built from variables is not read; docs/limits.md says so.
    """
    out = []
    for m in ASPIRE_CONTAINER.finditer(text):
        end = text.find(";", m.end())
        statement = text[m.start(): end if end != -1 else len(text)]
        image, tag = m.group(1), m.group(2) or ""
        retag = ASPIRE_TAG.findall(statement)
        if retag:
            tag = retag[-1]
        out.append((text.count("\n", 0, m.start()) + 1, f"{image}:{tag}" if tag else image, "WithImageSHA256(" in statement))
    return out


def find_pins(ctx: Context) -> list[dict]:
    out = []
    want_digest = ctx.profile == "regulated"
    locks = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "npm-shrinkwrap.json"}
    files = ctx.src.files()
    lock_dirs = {f.rsplit("/", 1)[0] if "/" in f else "" for f in files if f.rsplit("/", 1)[-1] in locks}

    def add(rule, rel, n, text):
        out.append({"rule": rule, "path": rel, "line": n, "text": text[:160]})

    for rel in files:
        name = rel.rsplit("/", 1)[-1]
        low = name.lower()
        is_yaml = low.endswith((".yml", ".yaml"))
        is_docker = low.startswith("dockerfile") or low.endswith(".dockerfile")
        is_reqs = fnmatch.fnmatch(low, "requirements*.txt")
        is_host = low.endswith(".cs")
        if not (is_yaml or is_docker or is_reqs or is_host or low == "package.json" or low.endswith((".csproj", ".props"))):
            continue
        try:
            text = ctx.src.read(rel)
        except (OSError, KitError, UnicodeDecodeError):
            continue
        if is_host:
            if "AddContainer(" in text:
                for n, ref, digest in _host_images(text):
                    hit = None if digest else _image_problem(ref, want_digest)
                    if hit:
                        add(hit[0], rel, n, hit[1])
            continue
        if low == "package.json":
            try:
                data = json.loads(text)
            except ValueError:
                continue
            deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
            for dep, ver in sorted(deps.items()):
                if str(ver).strip() in ("", "*", "x", "latest", "next"):
                    add("pin-package", rel, 0, f"{dep} is requested as {ver!r}")
            folder = rel.rsplit("/", 1)[0] if "/" in rel else ""
            ancestors = {"/".join(folder.split("/")[:i]) for i in range(len(folder.split("/")) + 1)} if folder else {""}
            if deps and not (ancestors & lock_dirs):
                add("pin-package", rel, 0, "dependencies with no lockfile beside or above this manifest")
            continue
        stages: set[str] = set()
        for n, line in enumerate(text.splitlines(), 1):
            if is_yaml:
                m = re.match(r"\s*-?\s*uses:\s*([^\s#]+)", line)
                if m and rel.startswith(".github/"):
                    ref = m.group(1).strip("\"'")
                    if ref.startswith("docker://"):
                        hit = _image_problem(ref[9:], want_digest)
                        if hit:
                            add(hit[0], rel, n, hit[1])
                    elif not ref.startswith("./") and not re.search(r"@[0-9a-f]{40}$", ref):
                        add("pin-action", rel, n, f"{ref} is not pinned to a commit")
                m = re.match(r"\s*-?\s*image:\s*([^\s#]+)", line)
                if m:
                    hit = _image_problem(m.group(1), want_digest)
                    if hit:
                        add(hit[0], rel, n, hit[1])
            elif is_docker:
                m = re.match(r"\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?", line, re.I)
                if m:
                    if m.group(1).lower() not in stages:
                        hit = _image_problem(m.group(1), want_digest)
                        if hit:
                            add(hit[0], rel, n, hit[1])
                    if m.group(2):
                        stages.add(m.group(2).lower())
            elif is_reqs:
                s = line.split("#", 1)[0].strip()
                if s and not s.startswith("-") and "==" not in s and " @ " not in s:
                    add("pin-package", rel, n, f"{s} is not pinned to an exact version")
            else:
                m = re.search(r'<PackageReference[^>]*\bVersion="([^"]*\*[^"]*)"', line)
                if m:
                    add("pin-package", rel, n, f"floating package version {m.group(1)}")
    return out


def find_gaps(ctx: Context) -> list[dict]:
    """Standing rules the map does not meet yet."""
    smap = load_map(ctx, required=False)
    if smap is None or ctx.profile not in SYS:
        return []
    out = []

    def add(rule, nid, text, path=MAP_PATH, line=0):
        out.append({"rule": rule, "path": path, "line": line, "text": f"{nid}: {text}"})

    for nid, n in smap.nodes.items():
        kind = n.get("type")
        if kind == "data-store":
            if not n.get("engine") or not n.get("engine_version"):
                add("store-engine-unknown", nid, "the map does not say which engine and version production runs")
            adapter = eng.engine_for(n.get("engine"))
            if adapter.foreign:
                for rel in _migration_files(ctx, n):
                    marks = adapter.foreign(rel, ctx.src.read(rel))
                    if marks:
                        add("migration-foreign-engine", nid, f"written for another engine ({', '.join(marks)}), not {adapter.id}", rel)
        elif kind in CONTRACT_TYPES:
            path, text, adapter = _contract(ctx, n)
            version = (adapter.version(text) if adapter and text is not None else "") or str(n.get("version") or "")
            if not version:
                add("unversioned-contract", nid, "the contract has no version")
            for consumer in users_of(smap, nid, {"calls", "subscribes", "reads"}):
                edge = next((e for e in smap.edges if e.get("from") == consumer and e.get("to") == nid), {})
                test = edge.get("contract_test")
                if not test:
                    add("contract-untested", nid, f"consumer {consumer} has no contract test")
                elif not ctx.src.exists(test) and not ctx.src.files(str(test).rstrip("/")):
                    add("contract-untested", nid, f"consumer {consumer} names contract test {test}, which does not exist")
            if path and not (n.get("drift") or {}).get("generated") and (n.get("drift") or {}).get("mode") != "design-first":
                add("contract-drift-undeclared", nid, "the map does not say how drift between this contract and the code is detected")
        elif kind in SHARED_TYPES:
            if not fmt.semver(_version_of(ctx, n)):
                add("unversioned-shared", nid, "the component has no semantic version (set version_file or version)")
        elif kind in EXTERNAL_TYPES:
            dep = n.get("dependency") or {}
            missing = [f for f in DEP_FIELDS if dep.get(f) in (None, "")]
            if missing:
                add("external-dep-incomplete", nid, f"the dependency record lacks {', '.join(missing)}")
    return out


def find_all(ctx: Context) -> list[dict]:
    try:
        if ctx.profile not in SYS:
            return []
    except KitError:
        return []
    return find_pins(ctx) + find_gaps(ctx)


def _carried(ctx: Context, res: Result, what: str = "finding(s)") -> None:
    waivers, groups = active_waivers(ctx)
    report_unwaived(ctx, res, res.check, waivers, groups, what)


def _migration_files(ctx: Context, node: dict) -> list[str]:
    globs = node.get("migrations") or []
    if not globs:
        return []
    return [f for f in ctx.src.files() if any(fnmatch.fnmatch(f, g) for g in globs)
            and not f.endswith((".Designer.cs", "ModelSnapshot.cs"))]


# ── data stores (CHG-1 to CHG-5) ────────────────────────────────────────────────

def data_plan(ctx: Context, spec: str) -> tuple[dict, dict[str, str]] | None:
    rel = f"specs/{spec}/{PLAN}"
    if not ctx.src.exists(rel):
        return None
    text = ctx.src.read(rel)
    return front_matter(text), sections(text)


def touched_stores(ctx: Context, smap: SystemMap, spec: str) -> list[str]:
    return [t for t in touches(ctx, spec) if (smap.nodes.get(t) or {}).get("type") in DATA_TYPES]


def detect(ctx: Context, smap: SystemMap, spec: str, fm: dict) -> tuple[list[tuple[str, str, str]], list[str]]:
    """Every classified statement of the plan's migrations as (path, class, reason), plus notes."""
    found, notes = [], []
    stores = [store_of(smap, s) for s in touched_stores(ctx, smap, spec)]
    adapters = [eng.engine_for(s.get("engine")) for s in stores] or [eng.engine_for(None)]
    for rel in [str(m) for m in fm.get("migrations") or []]:
        if not ctx.src.exists(rel):
            notes.append(f"{rel} is planned but not written yet")
            continue
        text = ctx.src.read(rel)
        for adapter in adapters:
            if adapter.classify:
                for cls, reason in adapter.classify(rel, text):
                    found.append((rel, cls, reason))
    for adapter in adapters:
        for change in fm.get("changes") or []:
            kind = str(change.get("kind") if isinstance(change, dict) else change)
            if kind in adapter.declared:
                found.append((f"specs/{spec}/{PLAN}", adapter.declared[kind], f"declared change {kind}"))
    return found, notes


@check("CK-DATA-PLAN", ("CHG-1", "CHG-3", "CHG-5", "ADP-6"), "a spec that touches a data store has a complete data-change plan", profiles=SYS)
def ck_data_plan(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for spec in plan_specs(ctx):
        stores = touched_stores(ctx, smap, spec)
        if not stores:
            continue
        rel = f"specs/{spec}/{PLAN}"
        plan = data_plan(ctx, spec)
        if plan is None:
            res.fail(f"the spec touches {', '.join(stores)} but has no data-change plan", rel)
            continue
        fm, secs = plan
        if fm.get("classification") not in eng.RANK:
            res.fail(f"classification must be one of {', '.join(eng.RANK)}", rel)
        for s in stores:
            if s not in [str(x) for x in fm.get("stores") or []]:
                res.fail(f"the plan does not name {s} under `stores`", rel)
        wanted: list[str] = []
        for s in stores:
            store = store_of(smap, s)
            adapter = eng.engine_for(store.get("engine"))
            if not eng.has_adapter(store.get("engine")):
                res.notes.append(f"no engine adapter for {store.get('engine') or 'an unnamed engine'} ({s}): "
                                 "headings are checked, the classification is taken as written")
            wanted += [h for h in adapter.headings if h not in wanted]
        for h in wanted:
            if h not in secs:
                res.fail(f"the plan has no section '{h}'", rel)
            elif _empty(secs[h]):
                res.fail(f"section '{h}' is empty", rel)
        named = secs.get("Readers and writers", "")
        for s in stores:
            for user in sorted(set(users_of(smap, store_of(smap, s).get("id", s), {"reads", "writes"}) + users_of(smap, s, {"reads", "writes"}))):
                if user not in named:
                    res.fail(f"'Readers and writers' does not name {user}, which the map says uses {s}", rel)


@check("CK-DATA-CLASS", ("CHG-2",), "a breaking or destructive data change is declared as one and planned as one", profiles=SYS)
def ck_data_class(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    changed = changed_files(ctx)
    for spec in plan_specs(ctx):
        plan = data_plan(ctx, spec)
        if plan is None:
            continue
        fm, secs = plan
        rel = f"specs/{spec}/{PLAN}"
        declared = fm.get("classification")
        listed = [str(m) for m in fm.get("migrations") or []]
        if changed is not None and spec in active_specs(ctx):
            for s in touched_stores(ctx, smap, spec):
                for f in _migration_files(ctx, store_of(smap, s)):
                    if f in changed and f not in listed:
                        res.fail(f"{f} is a migration for {s} that the plan does not list", rel)
        found, notes = detect(ctx, smap, spec, fm)
        res.notes += notes
        for path, cls, reason in found:
            if cls == "unrecognised":
                res.notes.append(f"{path}: not classified, check by hand: {reason}")
            elif eng.rank(cls) > eng.rank(declared):
                res.fail(f"the plan declares {declared}, but this is {cls}: {reason}", path)
        level = max([eng.rank(declared)] + [eng.rank(c) for _, c, _ in found])
        if level >= eng.rank("breaking") and _empty(secs.get("Expand, migrate, contract")):
            res.fail("a breaking change needs a section 'Expand, migrate, contract' that spreads it across releases", rel)
        if level >= eng.rank("destructive"):
            if _empty(secs.get("Restore test")):
                res.fail("a destructive change needs a section 'Restore test'", rel)
            proof = fm.get("restore_evidence")
            if not proof or not ctx.src.exists(str(proof)):
                res.fail("a destructive change needs `restore_evidence`: the file that shows a restore was tested", rel)
            for drel, rec in decisions(ctx):
                if str(rec.get("spec")) == spec and rec.get("gate") == "G3" and rec.get("decision") in ("approve", "approve-with-conditions") \
                        and "data-owner" not in [a.get("role") for a in rec.get("approvals") or []]:
                    res.fail("the plan was approved at G3 without the Data Owner, and the change is destructive", drel)


def _run_file(ctx: Context, spec: str) -> dict | None:
    rel = f"specs/{spec}/{MIGRATION_RUN}"
    return (ctx.src.yaml(rel) or {}) if ctx.src.exists(rel) else None


def _written(ctx: Context, fm: dict) -> list[str]:
    return [str(m) for m in fm.get("migrations") or [] if ctx.src.exists(str(m))]


@check("CK-MIGRATION-ENGINE", ("CHG-4", "ADP-5"), "migrations are written for, and were applied on, the engine production runs", profiles=SYS)
def ck_migration_engine(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    for spec in plan_specs(ctx):
        plan = data_plan(ctx, spec)
        if plan is None:
            continue
        written = _written(ctx, plan[0])
        if not written:
            continue
        rel = f"specs/{spec}/{MIGRATION_RUN}"
        run = _run_file(ctx, spec)
        if run is None:
            res.fail(f"{len(written)} migration(s) exist but there is no record of applying them in CI", rel)
            continue
        store = store_of(smap, str(run.get("store") or (touched_stores(ctx, smap, spec) or [""])[0]))
        if not store:
            res.fail(f"the run names store {run.get('store')!r}, which is not in the map", rel)
            continue
        if str(run.get("engine", "")).lower() != str(store.get("engine", "")).lower():
            res.fail(f"applied on {run.get('engine')}, but {store.get('id')} runs {store.get('engine')}", rel)
        if not eng.major(store.get("engine_version")) or eng.major(run.get("engine_version")) != eng.major(store.get("engine_version")):
            res.fail(f"applied on version {run.get('engine_version')}, but {store.get('id')} runs {store.get('engine_version')}", rel)
        if run.get("result") != "pass":
            res.fail(f"the migration run did not pass (result: {run.get('result')})", rel)
        applied = {str(a.get("path")): a.get("sha256") for a in run.get("applied") or [] if isinstance(a, dict)}
        for m in written:
            if m not in applied:
                res.fail(f"{m} was not applied in the recorded run", rel)
            elif applied[m] != hashlib.sha256(ctx.src.read_bytes(m)).hexdigest():
                res.fail(f"{m} changed after the recorded run", rel)


@check("CK-MIGRATION-DRIFT", ("CHG-4",), "the model and the migrations agree, and no migration warning is suppressed", profiles=SYS)
def ck_migration_drift(ctx: Context, res: Result) -> None:
    _carried(ctx, res, "suppression(s)")
    for spec in plan_specs(ctx):
        plan = data_plan(ctx, spec)
        if plan is None or not _written(ctx, plan[0]):
            continue
        run = _run_file(ctx, spec)
        if run is None:
            res.notes.append(f"{spec}: no migration run recorded; CK-MIGRATION-ENGINE reports it")
            continue
        drift = run.get("model_drift")
        if drift is None:
            res.fail("the run does not say whether the model and the migrations agree (model_drift)", f"specs/{spec}/{MIGRATION_RUN}")
        elif str(drift).lower() not in ("none", "false", "no"):
            res.fail(f"the model has changes with no migration: {drift}", f"specs/{spec}/{MIGRATION_RUN}")


@check("CK-SHARED-STORE", ("CHG-4",), "a store written by more than one service is flagged shared, with every writer named", profiles=SYS)
def ck_shared_store(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for nid, n in smap.nodes.items():
        if n.get("type") != "data-store":
            continue
        writers = users_of(smap, nid, {"writes"})
        if len(writers) < 2:
            continue
        if n.get("shared") is not True:
            res.fail(f"{nid} is written by {', '.join(writers)} but is not flagged `shared: true`", MAP_PATH)
        for w in writers:
            if w not in [str(x) for x in n.get("writers") or []]:
                res.fail(f"{nid} does not name writer {w} under `writers`", MAP_PATH)


# ── synthetic data (CHG-4) ──────────────────────────────────────────────────────

DATA_GLOBS = ["*seed*", "*/fixtures/*", "*/__fixtures__/*", "*/testdata/*", "*/test-data/*", "*/test_data/*", "*/seeds/*", "*/mocks/*"]
DATA_EXT = (".json", ".csv", ".tsv", ".sql", ".yml", ".yaml", ".xml", ".ndjson", ".jsonl", ".txt")
_RESERVED = re.compile(r"(?i)(^|\.)(example\.(com|org|net)|example|test|invalid|localhost|local)$")
_TEST_CARDS = {"4111111111111111", "4242424242424242", "4000056655665556", "5555555555554444", "5105105105105100",
               "378282246310005", "371449635398431", "6011111111111117", "4012888888881881", "2223003122003222"}


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def personal_patterns(line: str) -> list[str]:
    """Names of the personal-data patterns a line matches. The matched value is never returned."""
    hits = []
    for m in re.finditer(r"[\w.+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)", line):
        if not _RESERVED.search(m.group(1)):
            hits.append("email address on a real domain")
            break
    for m in re.finditer(r"(?<![\d-])(\d{3})-(\d{2})-(\d{4})(?![\d-])", line):
        area, group, serial = m.groups()
        if area not in ("000", "666") and area[0] != "9" and group != "00" and serial != "0000" \
                and m.group(0) not in ("078-05-1120", "219-09-9999", "123-45-6789"):
            hits.append("US social security number format")
            break
    for m in re.finditer(r"(?<![\d.])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]([2-9]\d{2})[\s.-](\d{4})(?![\d.])", line):
        if not (m.group(2) == "555" and m.group(3).startswith("01")):
            hits.append("phone number outside the reserved 555-01xx range")
            break
    for m in re.finditer(r"(?<![\d.])(?:\d[ -]?){12,18}\d(?![\d.])", line):
        digits = re.sub(r"\D", "", m.group(0))
        if 13 <= len(digits) <= 19 and digits not in _TEST_CARDS and len(set(digits)) > 2 and _luhn(digits) \
                and digits[0] in "23456":
            hits.append("payment card number that passes its checksum")
            break
    return hits


@check("CK-SYNTH-DATA", ("CHG-4",), "seed and test data contain no realistic personal data", profiles=SYS)
def ck_synth_data(ctx: Context, res: Result) -> None:
    cfg = ctx.kit().get("synthetic_data") or {}
    globs = list(cfg.get("paths") or DATA_GLOBS)
    allow = list(cfg.get("allow") or [])
    extra = []
    for _, body in ctx.packs():
        extra += list((body.get("personal_data_patterns") or {}).items())
    extra = [(name, re.compile(rx)) for name, rx in extra + list((cfg.get("patterns") or {}).items())]
    scanned = 0
    for rel in ctx.src.files():
        if rel.startswith((".specify/", "specs/", ".git/")) or not rel.lower().endswith(DATA_EXT):
            continue
        if not any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(rel.rsplit("/", 1)[-1], g) for g in globs):
            continue
        if any(fnmatch.fnmatch(rel, g) for g in allow):
            continue
        scanned += 1
        reported = set()
        for n, line in enumerate(ctx.src.read(rel).splitlines(), 1):
            for name in personal_patterns(line) + [nm for nm, rx in extra if rx.search(line)]:
                if name not in reported:  # one finding per pattern per file; the value itself is never printed
                    reported.add(name)
                    res.fail(f"looks like real personal data ({name})", f"{rel}:{n}")
    res.notes.append(f"scanned {scanned} seed or test data file(s)")


# ── contracts (CHG-6 to CHG-9) ──────────────────────────────────────────────────

def _contract_nodes(smap: SystemMap):
    return [(nid, n) for nid, n in smap.nodes.items() if n.get("type") in CONTRACT_TYPES]


def _declares(ctx: Context, key: str, nid: str) -> bool:
    for spec in active_specs(ctx):
        value = spec_front(ctx, spec).get(key) or []
        if nid in ([str(v) for v in value] if isinstance(value, list) else [str(k) for k in value]):
            return True
    return False


@check("CK-CONTRACT-VERSION", ("CHG-6",), "every contract has a version, and a changed contract has a new one", profiles=SYS)
def ck_contract_version(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    if not has_base(ctx):
        res.notes.append("skipped the comparison with the previous version: no base ref was given")
        return
    for nid, n in _contract_nodes(smap):
        path, old, new, adapter = _contract_changed(ctx, n)
        if old is None:
            continue
        before = (adapter.version(old) if adapter else "") or ""
        after = (adapter.version(new) if adapter else "") or str(n.get("version") or "")
        if adapter is None:
            res.notes.append(f"{nid}: no contract adapter reads {path}; the map's version field is used")
            continue
        if before and after == before:
            res.fail(f"{nid} changed but its version is still {after}", path)
        elif fmt.bump(before, after) == "down":
            res.fail(f"{nid} went from version {before} down to {after}", path)


@check("CK-CONTRACT-BREAK", ("CHG-7", "ADP-8"), "a breaking contract change is declared by the spec that makes it", profiles=SYS)
def ck_contract_break(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    if not has_base(ctx):
        res.notes.append("skipped: no base ref was given, so there is no previous version to compare with")
        return
    unread = []
    for nid, n in _contract_nodes(smap):
        path, old, new, adapter = _contract_changed(ctx, n)
        if old is None:
            continue
        if adapter is None:
            unread.append(f"{nid} ({path})")
            continue
        breaks = adapter.breaking(old, new)
        if not breaks:
            continue
        if _declares(ctx, "breaking", nid):
            res.notes.append(f"{nid}: {len(breaks)} breaking change(s), declared by the spec")
            continue
        res.fail(f"{nid} has {len(breaks)} breaking change(s) that no spec in this change declares under `breaking`", path)
        for b in breaks[:5]:
            res.fail(b, path)
    if unread:
        raise KitError(f"no contract adapter can compare {', '.join(unread)}; breaking changes there were not checked")


@check("CK-CONTRACT-CONSUMER", ("CHG-8",), "each consumer of a contract has a contract test, and it ran against the change", profiles=SYS)
def ck_contract_consumer(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    if not has_base(ctx):
        res.notes.append("skipped the run evidence: no base ref was given, so changed contracts are not known")
        return
    specs = active_specs(ctx)
    for nid, n in _contract_nodes(smap):
        path, old, _, _ = _contract_changed(ctx, n)
        if old is None:
            continue
        subject = subject_hash(ctx, smap, nid)
        for consumer in users_of(smap, nid, {"calls", "subscribes", "reads"}):
            why = passed(ctx, specs, "contract", nid, consumer, subject)
            if why:
                res.fail(f"{nid} changed and the contract test of consumer {consumer} {why}", path)


@check("CK-DEPRECATION", ("CHG-9",), "every deprecation has a date and a named migration path", profiles=SYS)
def ck_deprecation(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for nid, n in _contract_nodes(smap):
        path, text, adapter = _contract(ctx, n)
        recorded = {str(d.get("element")): d for d in n.get("deprecations") or [] if isinstance(d, dict)}
        found = adapter.deprecated(text) if adapter and text is not None else []
        for element in sorted(set(recorded) - {d["element"] for d in found}):
            found.append({"element": element, "sunset": None, "migration": None})
        for d in found:
            extra = recorded.get(d["element"], {})
            sunset, migration = d.get("sunset") or extra.get("sunset"), d.get("migration") or extra.get("migration")
            where = path or MAP_PATH
            if not sunset:
                res.fail(f"{nid}: {d['element']} is deprecated with no removal date", where)
            elif as_date(sunset) is None:
                res.fail(f"{nid}: {d['element']} has a removal date that is not a date: {sunset}", where)
            if not migration:
                res.fail(f"{nid}: {d['element']} is deprecated with no migration path", where)


@check("CK-CONTRACT-DRIFT", ("CHG-9", "TRC-9"), "the committed contract matches the one generated from the code", profiles=SYS)
def ck_contract_drift(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    missing = []
    for nid, n in _contract_nodes(smap):
        drift = n.get("drift") or {}
        gen = drift.get("generated")
        if not gen:
            if drift.get("mode") == "design-first":
                res.notes.append(f"{nid} is design-first: drift is caught by its contract tests, not by comparison")
            continue
        path, text, adapter = _contract(ctx, n)
        if text is None or adapter is None:
            res.fail(f"{nid} names a generated copy but its committed contract cannot be read", MAP_PATH)
            continue
        if not ctx.src.exists(gen):
            missing.append(f"{nid} ({gen})")
            continue
        declared, actual = adapter.surface(text), adapter.surface(ctx.src.read(gen))
        for item in sorted(actual - declared)[:10]:
            res.fail(f"{nid}: {item} exists in the code but not in the contract", path)
        for item in sorted(declared - actual)[:10]:
            res.fail(f"{nid}: {item} is in the contract but the code does not provide it", path)
    if missing:
        raise KitError(f"the copy generated from code is absent for {', '.join(missing)}; generate it before running the checks")


# ── shared components (CHG-10, CHG-11) ──────────────────────────────────────────

def _declared_kind(ctx: Context, nid: str) -> str | None:
    kinds = []
    for spec in active_specs(ctx):
        front = spec_front(ctx, spec)
        if nid in [str(x) for x in front.get("breaking") or []]:
            kinds.append("breaking")
        kind = (front.get("changes") or {}).get(nid) if isinstance(front.get("changes"), dict) else None
        if kind in fmt.KINDS:
            kinds.append(kind)
    return max(kinds, key=lambda k: fmt.BUMPS.index(fmt.KINDS[k])) if kinds else None


def _shared_changed(ctx: Context, smap: SystemMap) -> dict[str, list[str]] | None:
    nodes = changed_nodes(ctx, smap)
    if nodes is None:
        return None
    return {nid: files for nid, files in nodes.items() if (smap.nodes.get(nid) or {}).get("type") in SHARED_TYPES}


@check("CK-SHARED-SEMVER", ("CHG-10",), "a changed shared component has a version change that fits the kind of change", profiles=SYS)
def ck_shared_semver(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    changed = _shared_changed(ctx, smap)
    if changed is None:
        res.notes.append("skipped the comparison: no base ref or list of changed files was given")
        return
    for nid, files in sorted(changed.items()):
        n = smap.nodes[nid]
        vf = n.get("version_file")
        new = _version_of(ctx, n)
        if not fmt.semver(new):
            continue  # reported as unversioned-shared
        old_text = base_text(ctx, vf) if vf else None
        if vf and old_text is None:
            continue  # a new component: any first version is fine
        old = fmt.read_version(vf, old_text) if vf else str(n.get("previous_version") or "")
        if not old:
            res.notes.append(f"{nid}: no previous version to compare with")
            continue
        got = fmt.bump(old, new)
        kind = _declared_kind(ctx, nid)
        where = vf or MAP_PATH
        if got in ("none", "down"):
            res.fail(f"{nid} changed ({len(files)} file(s)) but its version {'is still' if got == 'none' else 'went down to'} {new}", where)
        elif kind is None:
            res.fail(f"{nid} changed but no spec says what kind of change it is (`changes: {{{nid}: fix|feature|breaking}}`)", where)
        elif fmt.BUMPS.index(got) < fmt.BUMPS.index(fmt.required_bump(kind, old)):
            res.fail(f"{nid}: a {kind} change needs a {fmt.required_bump(kind, old)} version change; {old} -> {new} is {got}", where)


@check("CK-CONSUMER-MATRIX", ("CHG-11",), "every consumer of a changed shared component was built and tested against it", profiles=SYS)
def ck_consumer_matrix(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    changed = _shared_changed(ctx, smap)
    if changed is None:
        res.notes.append("skipped: no base ref or list of changed files was given")
        return
    specs = active_specs(ctx)
    for nid in sorted(changed):
        subject = subject_hash(ctx, smap, nid)
        for consumer in users_of(smap, nid, {"builds-with"}):
            why = passed(ctx, specs, "build", nid, consumer, subject)
            if why:
                res.fail(f"{nid} changed and the build and tests of consumer {consumer} {why}", f"specs/{(specs or ['?'])[0]}/{CONSUMER_RUNS}")


# ── external dependencies (CHG-13, CHG-14) ──────────────────────────────────────

AGREEMENT_STATES = ("in-place", "pending", "not-required")


@check("CK-EXTERNAL-DEP", ("CHG-13", "CHG-14"), "every external dependency records how it behaves and what is exchanged", profiles=SYS)
def ck_external_dep(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    _carried(ctx, res)
    agreement = None
    for _, body in ctx.packs():
        agreement = body.get("agreement") or agreement
    protected = restricted_classes(ctx)
    for nid, n in smap.nodes.items():
        if n.get("type") not in EXTERNAL_TYPES:
            continue
        dep = n.get("dependency") or {}
        if agreement and (n.get("classification") in protected or dep.get("data_classification") in protected):
            name = agreement.get("name", "legal agreement")
            status = (n.get("agreement") or {}).get("status")
            if status not in AGREEMENT_STATES:
                res.fail(f"{nid} exchanges protected data, so it must record the status of the {name.lower()}: "
                         f"one of {', '.join(AGREEMENT_STATES)}", MAP_PATH)
            elif status == "pending":
                res.notes.append(f"{nid}: the {name.lower()} is pending")
            for key in sorted(set(n.get("agreement") or {}) - {"status", "type", "owner", "reviewed"}):
                res.fail(f"{nid}: record the agreement's status, not the agreement ({key} does not belong in the repository)", MAP_PATH)


# ── supply chain (CHG-15) ───────────────────────────────────────────────────────

def _licences(component: dict) -> list[str]:
    out = []
    for item in component.get("licenses") or []:
        if not isinstance(item, dict):
            continue
        lic = item.get("license") or {}
        for value in (lic.get("id"), lic.get("name"), item.get("expression")):
            if value:
                out += [x for x in re.split(r"\s+(?:AND|OR|WITH)\s+|[()\s]+", str(value)) if x]
    return out


@check("CK-SBOM", ("CHG-15",), "a release has a bill of materials and every licence in it is allowed", profiles=SYS)
def ck_sbom(ctx: Context, res: Result) -> None:
    policy = ((ctx.kit().get("supply_chain") or {}).get("licences")) or {}
    deny, allow = [str(x).lower() for x in policy.get("deny") or []], [str(x).lower() for x in policy.get("allow") or []]
    done = approved_gates(ctx)
    for spec in ctx.specs():
        rel = f"specs/{spec}/{SBOM}"
        releasing = "G7" in done.get(spec, set()) or any(f != rel for f in ctx.src.files(f"specs/{spec}/release"))
        if not ctx.src.exists(rel):
            if releasing:
                res.fail("the spec is being released with no bill of materials", rel)
            continue
        try:
            doc = json.loads(ctx.src.read(rel))
        except ValueError:
            res.fail("the bill of materials is not valid JSON", rel)
            continue
        components = doc.get("components")
        if doc.get("bomFormat") != "CycloneDX" or not isinstance(components, list) or not components:
            res.fail("the bill of materials must be CycloneDX JSON with at least one component", rel)
            continue
        if not deny and not allow:
            res.fail("kit.yml states no licence policy (supply_chain.licences.deny or .allow)", f"{KIT_DIR}/kit.yml")
            continue
        unknown = []
        for c in components:
            label = f"{c.get('name')}@{c.get('version')}"
            found = _licences(c)
            if not found:
                unknown.append(label)
            for lic in found:
                if lic.lower() in deny or (allow and lic.lower() not in allow):
                    res.fail(f"{label} is licensed {lic}, which the licence policy does not allow", rel)
        if unknown and not policy.get("allow_unknown"):
            res.fail(f"{len(unknown)} component(s) state no licence, for example {', '.join(unknown[:3])}", rel)


@check("CK-PIN", ("CHG-15",), "dependencies, actions and images are pinned, not floating", profiles=SYS)
def ck_pin(ctx: Context, res: Result) -> None:
    _carried(ctx, res, "unpinned reference(s)")


# ── release order (CHG-18) ──────────────────────────────────────────────────────

def depends(smap: SystemMap, among: set[str]) -> list[tuple[str, str]]:
    """(consumer, provider) pairs among the given nodes: direct use, or use of a contract or event the provider owns."""
    pairs = set()
    for e in smap.edges:
        a, b, rel = e.get("from"), e.get("to"), e.get("rel")
        if rel not in USES:
            continue
        if a in among and b in among:
            pairs.add((a, b))
        for o in smap.edges:
            if o.get("to") == b and o.get("rel") in ("owns", "publishes") and o.get("from") in among and a in among and o["from"] != a:
                pairs.add((a, o["from"]))
    for e in smap.edges:  # a store's owner deploys after the store it owns is migrated
        if e.get("rel") == "owns" and e.get("from") in among and e.get("to") in among and \
                (smap.nodes.get(e["to"]) or {}).get("type") in DATA_TYPES:
            pairs.add((e["from"], e["to"]))
    return sorted(pairs)


def _order(items) -> list[str]:
    return [str(i.get("node") if isinstance(i, dict) else i) for i in items or []]


@check("CK-ROLLOUT", ("CHG-18",), "a change to several deployable nodes states a deploy and rollback order that the map allows", profiles=SYS)
def ck_rollout(ctx: Context, res: Result) -> None:
    smap = load_map(ctx)
    for spec in plan_specs(ctx):
        nodes = [t for t in touches(ctx, spec) if (smap.nodes.get(t) or {}).get("type") in DEPLOYABLE]
        if len(nodes) < 2:
            continue
        rel = f"specs/{spec}/{ROLLOUT}"
        if not ctx.src.exists(rel):
            res.fail(f"the spec touches {', '.join(nodes)} but states no deploy and rollback order", rel)
            continue
        doc = ctx.src.yaml(rel) or {}
        deploy, rollback = _order(doc.get("deploy")), _order(doc.get("rollback"))
        for n in nodes:
            if n not in deploy:
                res.fail(f"the deploy order does not include {n}", rel)
            if n not in rollback:
                res.fail(f"the rollback order does not include {n}", rel)
        if "flags" not in doc:
            res.fail("the rollout does not say which flags guard the change (an empty list is an answer)", rel)
        if _empty(str(doc.get("compatibility_window") or "")):
            res.fail("the rollout states no compatibility window", rel)
        for consumer, provider in depends(smap, set(nodes)):
            if consumer in deploy and provider in deploy and deploy.index(consumer) < deploy.index(provider):
                res.fail(f"{consumer} is deployed before {provider}, which it depends on", rel)
            if consumer in rollback and provider in rollback and rollback.index(provider) < rollback.index(consumer):
                res.fail(f"{provider} is rolled back before {consumer}, which depends on it", rel)
