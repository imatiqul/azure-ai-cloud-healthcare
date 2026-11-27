"""agentic-spec-kit system extension (slice 0.2): system map, discovery, impact analysis and change packs.

Importing this package registers its checks, commands and self-test fixtures with the core kit.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

from agentic_kit import core

from . import checks_change, checks_map, discover, programme, sample
from .mapmodel import MAP_PATH, load_map

__version__ = "0.2.0"

core.ROLE_HOOKS.append(checks_map.role_hook)
core.MANIFEST_HOOKS.append(checks_map.manifest_hook)
core.LANE_HOOKS.append(checks_map.lane_hook)
core.BRIEF_HOOKS.append(checks_map.brief_hook)
core.ARTIFACT_HOOKS.append(checks_map.artifact_hook)
core.READING_HOOKS.append(checks_map.reading_hook)
core.WHY_HOOKS.append(checks_map.why_hook)
core.CHANGESET_HOOKS.append(programme.section)  # a programme seen from its parent (PRG-1)


def map_view(ctx) -> str:
    """TRC-15: the system map as a diagram (Mermaid source) and a table of what each component is and who owns it."""
    import re

    from .mapmodel import load_map
    smap = load_map(ctx, required=False)
    if smap is None:
        return "# System map\n\nThere is no system map in this repository yet.\n"

    def ident(node: str) -> str:
        return "n_" + re.sub(r"[^A-Za-z0-9]", "_", node)
    lines = ["# System map", "", "```mermaid", "flowchart LR"]
    for nid, node in sorted(smap.nodes.items()):
        lines.append(f'  {ident(nid)}["{nid}<br/>{node.get("type", "?")} · {node.get("owner", "?")} · {node.get("tier", "?")}"]')
    for e in smap.edges:
        if e.get("from") in smap.nodes and e.get("to") in smap.nodes:
            lines.append(f'  {ident(str(e["from"]))} -->|{e.get("rel", "")}| {ident(str(e["to"]))}')
    lines += ["```", "", "| Component | Type | Owner | Tier | Data | Used by |", "|---|---|---|---|---|---|"]
    for nid, node in sorted(smap.nodes.items()):
        users = ", ".join(sorted({who for who, _ in smap.consumers(nid)})) or "-"
        lines.append(f"| `{nid}` | {node.get('type', '?')} | {node.get('owner', '?')} | {node.get('tier', '?')} | {node.get('classification', '?')} | {users} |")
    return "\n".join(lines) + "\n"


core.VIEW_HOOKS["map"] = map_view
core.SAMPLE_HOOKS.append(sample.extend_sample)
core.FIXTURE_HOOKS.append(sample.fixtures)

# Change packs: findings a waiver or the adoption baseline can carry, and the evidence each gate binds.
core.FINDER_HOOKS.append(checks_change.find_all)
core.RULE_OWNERS.update(checks_change.RULES)


def _register() -> None:
    from agentic_kit import __main__ as cli
    from agentic_kit import adapters, selftest
    adapters.DEFAULT_SUPPRESSIONS["migration-warning-suppress"] = checks_change.MIGRATION_WARNING
    for target, gate, files in ((cli.DEFAULT_EVIDENCE, "G3", [checks_change.PLAN, checks_change.ROLLOUT]),
                                (selftest.GATE_PLAN, "G3", [checks_change.PLAN, checks_change.ROLLOUT]),
                                (selftest.GATE_PLAN, "G5", [checks_change.MIGRATION_RUN, checks_change.CONSUMER_RUNS])):
        current = target[gate]
        names = current[0] if isinstance(current, tuple) else current
        names += [f for f in files if f not in names]


_register()

MAP_CHECKS = ["CK-MAP-SCHEMA", "CK-MAP-OWNER", "CK-MAP-EVIDENCE", "CK-MAP-DRIFT", "CK-MAP-FEDERATION"]


def _ctx(args):
    from agentic_kit.__main__ import _context
    return _context(args)


def cmd_map(args) -> int:
    from agentic_kit.__main__ import _report
    ctx = _ctx(args)
    if args.action == "discover":
        found = discover.discover(ctx)
        draft = discover.draft_map(found)
        if args.write:
            path = ctx.src.root / "system-map" / "map.draft.yml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(yaml.safe_dump(draft, sort_keys=False), encoding="utf-8", newline="\n")
            print(f"wrote system-map/map.draft.yml: {len(draft['nodes'])} nodes, {len(draft['edges'])} edges")
            print("Every node needs an owner, a tier and a classification from a person before it becomes map.yml.")
        elif args.json:
            print(json.dumps(found, indent=2))
        else:
            for n in found["nodes"]:
                print(f"{n['type']:16} {n['id']:40} {n['evidence']}")
            print(f"\n{len(found['nodes'])} nodes, {len(found['edges'])} edges")
        return 0
    return _report([core.run_check(c, ctx) for c in MAP_CHECKS], args.json)


def cmd_impact(args) -> int:
    ctx = _ctx(args)
    smap = load_map(ctx)
    specs = [args.spec] if args.spec else [s for s in ctx.specs() if ctx.src.exists(f"specs/{s}/spec.md")]
    for spec in specs:
        impact = checks_map.compute_impact(ctx, smap, spec)
        text = checks_map.render_impact(impact, smap)
        if args.write:
            (ctx.src.root / "specs" / spec / "impact.md").write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote specs/{spec}/impact.md")
        if args.matrix:
            consumers = sorted({a["node"] for a in impact["affected"] if a["distance"] == 1})
            print(json.dumps({"include": [{"consumer": c} for c in consumers]}))
        elif args.json:
            print(json.dumps(impact, indent=2))
        elif not args.write:
            print(text)
    return 0


CHANGE_CHECKS = ["CK-DATA-PLAN", "CK-DATA-CLASS", "CK-MIGRATION-ENGINE", "CK-MIGRATION-DRIFT", "CK-SHARED-STORE", "CK-SYNTH-DATA",
                 "CK-CONTRACT-VERSION", "CK-CONTRACT-BREAK", "CK-CONTRACT-CONSUMER", "CK-DEPRECATION", "CK-CONTRACT-DRIFT",
                 "CK-SHARED-SEMVER", "CK-CONSUMER-MATRIX", "CK-EXTERNAL-DEP", "CK-SBOM", "CK-PIN", "CK-ROLLOUT"]


def _plan_skeleton(ctx, smap, spec: str, stores: list[str]) -> str:
    from . import engines
    cc = checks_change
    headings: list[str] = []
    for s in stores:
        headings += [h for h in engines.engine_for(cc.store_of(smap, s).get("engine")).headings if h not in headings]
    users = sorted({u for s in stores for u in cc.users_of(smap, s, {"reads", "writes"})})
    lines = ["---", f"stores: [{', '.join(stores)}]", "classification: TBD   # additive | backward-compatible | breaking | destructive",
             "migrations: []", "---", f"# Data-change plan: {spec}", ""]
    for h in headings:
        body = "TBD"
        if h == "Readers and writers":
            body = "From the system map: " + (", ".join(users) or "no reader or writer is recorded") + ". Say what each one needs during the change."
        lines += [f"## {h}", body, ""]
    lines += ["<!-- Add '## Expand, migrate, contract' for a breaking change, and '## Restore test' plus",
              "     `restore_evidence:` in the front matter for a destructive one. -->", ""]
    return "\n".join(lines)


def cmd_change(args) -> int:
    from agentic_kit.__main__ import _report
    from . import engines
    cc = checks_change
    ctx = _ctx(args)
    smap = load_map(ctx)
    if args.action == "check":
        return _report([core.run_check(c, ctx) for c in CHANGE_CHECKS], args.json)
    if args.action == "classify":
        files = list(args.file)
        adapter = engines.engine_for(args.engine)
        if args.spec:
            plan = cc.data_plan(ctx, args.spec)
            files += [str(m) for m in (plan[0].get("migrations") if plan else None) or []]
            stores = cc.touched_stores(ctx, smap, args.spec)
            if stores and not args.engine:
                adapter = engines.engine_for(cc.store_of(smap, stores[0]).get("engine"))
        if not adapter.classify:
            print(f"no engine adapter classifies changes for {adapter.id}", file=__import__("sys").stderr)
            return 2
        rows, top = [], -1
        for rel in files:
            if not ctx.src.exists(rel):
                rows.append({"path": rel, "class": "missing", "reason": "file does not exist"})
                continue
            for cls, reason in adapter.classify(rel, ctx.src.read(rel)):
                rows.append({"path": rel, "class": cls, "reason": reason})
                top = max(top, engines.rank(cls))
            for mark in (adapter.foreign(rel, ctx.src.read(rel)) if adapter.foreign else []):
                rows.append({"path": rel, "class": "foreign-engine", "reason": mark})
        overall = engines.RANK[top] if top >= 0 else "nothing classified"
        if args.json:
            print(json.dumps({"engine": adapter.id, "overall": overall, "statements": rows}, indent=2))
        else:
            for r in rows:
                print(f"{r['class']:20} {r['path']}: {r['reason']}")
            print(f"\noverall: {overall} ({adapter.id})")
        return 0
    # plan: write the skeletons the triggered packs need; never overwrite
    spec = args.spec
    if not spec:
        print("--spec is required", file=__import__("sys").stderr)
        return 2
    wrote = []
    stores = cc.touched_stores(ctx, smap, spec)
    todo = []
    if stores:
        todo.append((f"specs/{spec}/{cc.PLAN}", _plan_skeleton(ctx, smap, spec, stores)))
    nodes = [t for t in checks_map.touches(ctx, spec) if (smap.nodes.get(t) or {}).get("type") in cc.DEPLOYABLE]
    if len(nodes) > 1:
        order = sorted(nodes, key=lambda n: sum(1 for c, p in cc.depends(smap, set(nodes)) if c == n))
        todo.append((f"specs/{spec}/{cc.ROLLOUT}",
                     "schema: agentic-rollout/1\n# Proposed from the system map: providers first. A person confirms the order.\n"
                     f"deploy: [{', '.join(order)}]\nrollback: [{', '.join(reversed(order))}]\nflags: []\ncompatibility_window: TBD\n"))
    for rel, text in todo:
        if ctx.src.exists(rel):
            print(f"kept {rel} (already exists)")
        elif args.write:
            (ctx.src.root / rel).write_text(text, encoding="utf-8", newline="\n")
            wrote.append(rel)
            print(f"wrote {rel}")
        else:
            print(f"--- {rel} ---\n{text}")
    if not todo:
        print("this spec touches no data store and at most one deployable node: no data-change plan or rollout order is needed")
    return 0


def cmd_contract(args) -> int:
    from . import contracts
    cc = checks_change
    ctx = _ctx(args)
    if args.node:
        node = load_map(ctx).nodes.get(args.node)
        if not node:
            print(f"{args.node} is not in the system map", file=__import__("sys").stderr)
            return 2
        path = cc.contract_file(node)
        old, new = cc.base_text(ctx, path), ctx.src.read(path)
        if old is None:
            print(f"{path} has no previous version at the base ref (pass --base-ref)", file=__import__("sys").stderr)
            return 2
    else:
        if not (args.old and args.new):
            print("give --node, or --old and --new", file=__import__("sys").stderr)
            return 2
        path = args.new
        old, new = Path(args.old).read_text(encoding="utf-8-sig"), Path(args.new).read_text(encoding="utf-8-sig")
    adapter = contracts.adapter_for(path, new)
    if adapter is None:
        print(f"no contract adapter reads {path}", file=__import__("sys").stderr)
        return 2
    breaks = adapter.breaking(old, new)
    info = {"format": adapter.id, "version": {"old": adapter.version(old), "new": adapter.version(new)}, "breaking": breaks}
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        print(f"{adapter.id}: version {info['version']['old'] or '?'} -> {info['version']['new'] or '?'}")
        for b in breaks:
            print(f"  breaking: {b}")
        print(f"{len(breaks)} breaking change(s)")
    return 1 if breaks else 0


def cmd_run(args) -> int:
    """Record that CI ran something, bound to the content it ran against."""
    import hashlib
    cc = checks_change
    ctx = _ctx(args)
    smap = load_map(ctx)
    base = ctx.src.root / "specs" / args.spec
    if not (base / "spec.md").exists():
        print(f"spec {args.spec} does not exist", file=__import__("sys").stderr)
        return 2
    if args.action == "migration":
        plan = cc.data_plan(ctx, args.spec)
        files = cc._written(ctx, plan[0]) if plan else []
        store = args.store or (cc.touched_stores(ctx, smap, args.spec) or [""])[0]
        doc = {"schema": "agentic-migration-run/1", "store": store, "engine": args.engine or cc.store_of(smap, store).get("engine"),
               "engine_version": args.engine_version, "result": args.result, "model_drift": args.model_drift,
               "applied": [{"path": f, "sha256": hashlib.sha256(ctx.src.read_bytes(f)).hexdigest()} for f in files]}
        rel = cc.MIGRATION_RUN
    else:
        for nid in (args.provider, args.consumer):
            if nid not in smap.nodes:
                print(f"{nid} is not in the system map", file=__import__("sys").stderr)
                return 2
        rel = cc.CONSUMER_RUNS
        path = base / rel
        doc = (yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None) or {"schema": "agentic-runs/1", "runs": []}
        row = {"kind": args.action, "provider": args.provider, "consumer": args.consumer, "result": args.result,
               "subject": cc.subject_hash(ctx, smap, args.provider)}
        doc["runs"] = [r for r in doc.get("runs") or []
                       if (r.get("kind"), r.get("provider"), r.get("consumer")) != (row["kind"], row["provider"], row["consumer"])] + [row]
    out = base / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8", newline="\n")
    core.audit_append(ctx.src.root, args.spec, {"type": "kit", "id": "agentic-system"}, f"run.{args.action}",
                      spec=args.spec, outputs=[f"specs/{args.spec}/{rel}"], result=args.result)
    print(f"wrote specs/{args.spec}/{rel}")
    return 0


def _cli(sub, common) -> None:
    sp = sub.add_parser("map", help="discover, validate and compare the system map")
    common(sp)
    sp.add_argument("action", choices=["discover", "validate"])
    sp.add_argument("--write", action="store_true", help="with discover: write system-map/map.draft.yml")
    sp.set_defaults(fn=cmd_map)
    sp = sub.add_parser("impact", help="compute the blast radius, tier and required approvers for a spec")
    common(sp)
    sp.add_argument("--spec")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--matrix", action="store_true", help="print the direct consumers as a CI matrix")
    sp.set_defaults(fn=cmd_impact)
    sp = sub.add_parser("change", help="data-change plans, migration classification and the change-pack checks")
    common(sp)
    sp.add_argument("action", choices=["plan", "classify", "check"])
    sp.add_argument("--file", action="append", default=[], help="with classify: a migration file; repeat for several")
    sp.add_argument("--spec")
    sp.add_argument("--engine", help="with classify: the engine, when no spec names the store")
    sp.add_argument("--write", action="store_true", help="with plan: write the skeleton files")
    sp.add_argument("--changed-files", help="with check: a file listing the changed paths, one per line")
    sp.add_argument("--today")
    sp.set_defaults(fn=cmd_change)
    sp = sub.add_parser("contract", help="compare a contract with its previous version and list breaking changes")
    common(sp)
    sp.add_argument("action", choices=["diff"])
    sp.add_argument("--node", help="a contract node; compared with --base-ref")
    sp.add_argument("--old")
    sp.add_argument("--new")
    sp.set_defaults(fn=cmd_contract)
    sp = sub.add_parser("run", help="record a CI run (consumer contract test, consumer build, migration) as evidence")
    common(sp)
    sp.add_argument("action", choices=["contract", "build", "migration"])
    sp.add_argument("--spec", required=True)
    sp.add_argument("--provider")
    sp.add_argument("--consumer")
    sp.add_argument("--store")
    sp.add_argument("--engine")
    sp.add_argument("--engine-version")
    sp.add_argument("--model-drift", default=None)
    sp.add_argument("--result", required=True, choices=["pass", "fail"])
    sp.set_defaults(fn=cmd_run)


core.CLI_HOOKS.append(_cli)
