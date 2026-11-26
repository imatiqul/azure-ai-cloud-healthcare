"""agentic-spec-kit team extension (slice 0.3): agent specs, runtime adapters, work items, locks, runs and golden tasks.

Importing this package registers its checks, commands and self-test fixtures with the core kit.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

from agentic_kit import core
from agentic_kit.core import KIT_DIR, KitError

from . import agents, checks_team, context, golden, ops, sample, tools, work

__version__ = "0.3.0"

core.SAMPLE_HOOKS.append(sample.extend_sample)
core.FIXTURE_HOOKS.append(sample.fixtures)

def brief_hook(ctx, spec: str, gate: str) -> list[tuple[str, list[str]]]:
    """What a reviewing agent disputed: returned work items and escalations, for the person at the gate."""
    lines = []
    for item in work.items(ctx, spec):
        for f in item.get("findings") or []:
            lines.append(f"- {item['id']}, round {f.get('round')}: {f.get('by')} returned it: {str(f.get('text'))[:140]}")
        if item.get("blocked_reason") == "rework-limit":
            lines.append(f"- {item['id']} is escalated: see `{work.escalation_path(spec, item['id'])}`")
    return [("Disputed", lines)]


core.BRIEF_HOOKS.append(brief_hook)
core.ARTIFACT_HOOKS.append(work.artifact_paths)
core.IMPLEMENTATION_HOOKS.append(checks_team.implementation)

TEAM_CHECKS = ["CK-AGENT-SPEC", "CK-WORKITEM", "CK-PATH-LOCK", "CK-PATH-DIFF", "CK-REWORK-LIMIT", "CK-BUDGET",
               "CK-AUTHOR-NEQ-VERIFIER", "CK-CRED", "CK-GOLDEN", "CK-CONTEXT", "CK-TOOL-ALLOWLIST",
               "CK-RUN-RECORD", "CK-ROUTING", "CK-GOLDEN-BASELINE", "CK-INJECTION", "CK-AGENT-MEMORY"]


def _register() -> None:
    from agentic_kit import __main__ as cli
    from agentic_kit import checks_trace
    if "CK-CRED" not in cli.DOCTOR_CHECKS:
        cli.DOCTOR_CHECKS.append("CK-CRED")
    core.VIEW_HOOKS["spend"] = ops.spend_view
    core.METRIC_HOOKS.append(ops.metrics)
    checks_trace.KNOWN_SOURCES["runs"] = lambda ctx: bool(ops.runs(ctx))


_register()


def _err(message: str, code: int = 1) -> int:
    print(message, file=sys.stderr)
    return code


def _guarded(fn):
    def run(args) -> int:
        try:
            return fn(args)
        except KitError as exc:
            return _err(str(exc))
    return run


def brief(ctx, agent_id: str, spec: str | None) -> str:
    specs = agents.load(ctx)
    if agent_id not in specs:
        raise KitError(f"{agent_id} is not an agent in {agents.AGENTS_DIR}")
    lines = [agents.body(specs[agent_id]), "## Waiting for you now"]
    mine, to_review = [], []
    for item in work.items(ctx, spec):
        label = f"- {item['spec']}/{item['id']} ({item['state']}): {item.get('title', '')} — paths: {', '.join(item.get('paths') or []) or 'none declared'}"
        if item.get("owner_agent") == agent_id and item.get("state") in ("ready", "in-progress", "rework"):
            mine.append(label)
            for f in item.get("findings") or []:
                if item.get("state") == "rework":
                    mine.append(f"  returned in round {f.get('round')} by {f.get('by')}: {f.get('text')}")
        if specs[agent_id].get("reviews") and item.get("state") == "in-review" and item.get("owner_agent") != agent_id:
            to_review.append(label + f" — handed off by {item.get('owner_agent')}: {(item.get('handoff') or {}).get('done', '')}")
    lines += mine or ["- no work item is assigned to you"]
    if specs[agent_id].get("reviews"):
        lines += ["", "## Waiting for your review"] + (to_review or ["- nothing is in review"])
    if agent_id == "orchestrator" and spec:
        groups = work.ready(ctx, spec)
        lines += ["", "## Ready to dispatch (items in one group may run at the same time)"]
        lines += [f"- group {n + 1}: " + ", ".join(f"{i['id']} ({i['owner_agent']})" for i in g) for n, g in enumerate(groups)] or ["- nothing is ready"]
    return "\n".join(lines) + "\n"


def _set_block(text: str, key: str, value: dict) -> str:
    """Replace or add one top-level block of a YAML file. The rest of the file, its comments included, stays as it is."""
    block = yaml.safe_dump({key: value}, sort_keys=False)
    lines = text.splitlines(keepends=True)
    start = next((n for n, line in enumerate(lines) if line.startswith(f"{key}:")), None)
    if start is None:
        return text + ("" if not text or text.endswith("\n") else "\n") + block
    end = start + 1
    while end < len(lines) and (lines[end][:1] in (" ", "\t") or not lines[end].strip()):
        end += 1
    while end > start + 1 and not lines[end - 1].strip():  # blank lines after the block belong to what follows
        end -= 1
    return "".join(lines[:start]) + block + "".join(lines[end:])


@_guarded
def cmd_team(args) -> int:
    from agentic_kit.__main__ import _context, _report
    ctx = _context(args)
    if args.action == "init":
        kit_path = ctx.src.root / KIT_DIR / "kit.yml"
        cfg = yaml.safe_load(kit_path.read_text(encoding="utf-8")) or {}
        if "team" not in cfg or args.runtimes or args.mode:
            team = dict(cfg.get("team") or {})
            team["runtimes"] = [r.strip() for r in (args.runtimes or ",".join(team.get("runtimes") or ["sequential"])).split(",") if r.strip()]
            team["mode"] = args.mode or team.get("mode") or ("parallel" if "claude" in team["runtimes"] else "sequential")
            team.setdefault("budget", {"steps": 200, "minutes": 240})
            for r in team["runtimes"]:
                if r not in agents.RUNTIMES:
                    return _err(f"unknown runtime {r!r}; choose from {', '.join(agents.RUNTIMES)}", 2)
            kit_path.write_text(_set_block(kit_path.read_text(encoding="utf-8"), "team", team), encoding="utf-8", newline="\n")
            ctx = _context(args)
        for rel in agents.install(ctx):
            print(f"wrote {rel}")
        for rel in agents.write_rendered(ctx):
            print(f"rendered {rel}")
        core.audit_append(ctx.src.root, "kit", {"type": "kit", "id": "agentic-team"}, "team.init", runtimes=agents.team_config(ctx)["runtimes"])
        print("Next: review the agent specs, add them to CODEOWNERS with the rest of .specify/, and run `doctor`.")
        return 0
    if args.action == "render":
        for rel in agents.write_rendered(ctx):
            print(f"rendered {rel}")
        return 0
    if args.action == "brief":
        if not args.agent:
            return _err("--agent is required", 2)
        print(brief(work.context(ctx.src.root), args.agent, args.spec))
        return 0
    if args.action == "check":
        return _report([core.run_check(c, ctx) for c in TEAM_CHECKS], args.json)
    if args.action == "context":
        if not args.spec or not args.item:
            return _err("--spec and --item are required", 2)
        wctx = work.context(ctx.src.root)
        try:
            if args.write:
                item = work.read_item(wctx, args.spec, args.item)
                item["context"] = context.write(wctx, args.spec, args.item)
                work.write_item(wctx, item)
                print(f"wrote {item['context']['path']} ({item['context']['sources']} source(s))")
            else:
                print(context.build(wctx, args.spec, args.item)[0])
        except KitError as exc:
            return _err(str(exc), 2)
        return 0
    if args.action == "tools":
        found, problems = tools.configured(ctx)
        for s in found:
            print(f"{s['file']:28} {s['name']:18} {s['url'] or ' '.join([s['command']] + s['args'])}")
        for message, rel in problems:
            print(f"{rel}: {message}")
        if not found:
            print("no MCP server is configured for an agent in this repository")
        if not ctx.src.exists(tools.TOOLS):
            if args.write:
                path = ctx.src.root / tools.TOOLS
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(tools.SKELETON, encoding="utf-8", newline="\n")
                print(f"wrote {tools.TOOLS}")
            else:
                print(f"there is no allowlist; add --write to create {tools.TOOLS}")
        return 0
    specs = agents.load(ctx)  # list
    cfg = agents.team_config(ctx)
    if args.json:
        print(json.dumps({"agents": {a: {k: v for k, v in s.items() if not k.startswith("_")} for a, s in specs.items()},
                          "runtimes": {r: agents.RUNTIMES[r]["enforces"] for r in cfg["runtimes"]}}, indent=2))
        return 0
    for aid in sorted(specs):
        s = specs[aid]
        print(f"{aid:22} supports {s.get('supports_role', ''):22} {'reviews' if s.get('reviews') else 'writes ' + (', '.join(s.get('write_paths') or []) or 'nothing')}")
    for r in cfg["runtimes"]:
        e = agents.RUNTIMES[r]["enforces"]
        print(f"\n{agents.RUNTIMES[r]['title']}\n  tools: {e['tools']}\n  paths: {e['paths']}\n  model: {e['model']}")
    return 0


@_guarded
def cmd_work(args) -> int:
    ctx = work.context(args.root)
    spec = args.spec
    if args.action == "create":
        made = work.create_from_tasks(ctx, spec)
        for item in made:
            print(f"{item['id']}: {item['owner_agent']} — {', '.join(item['paths']) or 'NO PATHS DECLARED'}")
        print(f"{len(made)} work item(s) created")
        return 0
    if args.action == "list":
        if args.ready:
            groups = work.ready(ctx, spec)
            if args.json:
                print(json.dumps({"groups": [[{"item": i["id"], "agent": i["owner_agent"], "paths": i["paths"]} for i in g] for g in groups]}))
            else:
                for n, g in enumerate(groups):
                    print(f"group {n + 1}: " + ", ".join(f"{i['id']} ({i['owner_agent']})" for i in g))
            return 0
        rows = work.items(ctx, spec)
        if args.json:
            print(json.dumps([{k: v for k, v in i.items() if not k.startswith("_")} for i in rows], indent=2))
        else:
            for i in rows:
                print(f"{i['spec']}/{i['id']:6} {i.get('state', ''):12} {i.get('owner_agent', ''):22} {i.get('title', '')[:60]}")
        return 0
    if not args.item:
        return _err("--item is required", 2)
    if args.action == "show":
        print(yaml.safe_dump({k: v for k, v in work.read_item(ctx, spec, args.item).items() if not k.startswith("_")}, sort_keys=False))
        return 0
    if args.action == "claim":
        item = work.claim(ctx, spec, args.item, args.agent or "", worktree=args.worktree)
        where = work.workdir(ctx, item)
        print(f"{spec}/{args.item} is in progress for {item['owner_agent']}. Work in {where} and only inside: {', '.join(item['paths'])}")
        return 0
    if args.action == "handoff":
        item = work.handoff(ctx, spec, args.item, args.agent or "", args.done or "", args.evidence or [], args.question or [])
        print(f"{spec}/{args.item} is in review. Files changed: {', '.join(item['handoff']['files']) or 'not recorded'}")
        if item.get("_questions"):
            print(f"The questions of this hand-off are in {work.decision_log.log_path(spec)}: {', '.join(item['_questions'])}. "
                  "A proposal is not a decision: a person decides it, and `decision decide` records that.")
        return 0
    if args.action == "review":
        if args.accept == bool(args.return_):
            return _err("give exactly one of --accept or --return \"<finding>\"", 2)
        outcome = work.review(ctx, spec, args.item, args.by or "", accept=args.accept, finding=args.return_ or "")
        if outcome == "escalated":
            print(f"{spec}/{args.item} has been returned twice already. It is now blocked and escalated to the accountable person: "
                  f"{work.escalation_path(spec, args.item)}. Do not start another round.")
            return 4
        print(f"{spec}/{args.item} is {outcome}")
        return 0
    print(work.integrate(ctx, spec, args.item))  # integrate
    return 0


@_guarded
def cmd_orchestrate(args) -> int:
    ctx = work.context(args.root)
    if args.action == "start":
        budget = None
        if args.steps or args.minutes:
            budget = {**agents.team_config(ctx)["budget"], **({"steps": args.steps} if args.steps else {}), **({"minutes": args.minutes} if args.minutes else {})}
        run = work.run_start(ctx, args.spec, args.mode or agents.team_config(ctx)["mode"], budget)
        print(f"run {run['id']} started for {args.spec}: budget {run['budget']['steps']} steps, {run['budget']['minutes']} minutes")
        return 0
    if not args.run:
        return _err("--run is required", 2)
    if args.action == "step":
        model = None
        if args.model:
            name, _, version = args.model.partition("@")
            model = {"name": name, "version": version}
        run, stopped = work.run_step(ctx, args.spec, args.run, args.agent or "orchestrator", args.do or "step", args.input, args.output,
                                     model=model, tools=[t.strip() for t in args.tools.split(",") if t.strip()] if args.tools is not None else None,
                                     cost=args.cost, seconds=args.seconds, gate=args.gate)
        if stopped:
            print(f"run {args.run} is stopped: {stopped}. Report: {run['report']}. Stop working and tell the accountable person.")
            return 3
        print(f"step {run['steps']} of {run['budget']['steps']}")
        return 0
    if args.action == "stop":
        run = work.run_stop(ctx, args.spec, args.run, args.reason or "stopped")
        print(f"run {args.run} is {run['state']}: {run['report']}")
        return 0
    print(yaml.safe_dump(work.read_run(ctx, args.spec, args.run), sort_keys=False))
    return 0


def cmd_golden(args) -> int:
    if args.action == "baseline":
        from agentic_kit.__main__ import _context
        ctx = _context(args)
        if not ctx.src.exists(golden.RESULTS):
            return _err(f"there are no golden results at {golden.RESULTS}; run the golden tasks first and write them there with --out", 2)
        try:
            reviewer, role, ref = (args.accepted_by or "").split(":", 2)
        except ValueError:
            return _err("--accepted-by must be reviewer:role:pull/<n>#review-<id>: a person accepts the baseline", 2)
        doc = ops.make_baseline(ctx, {"reviewer": reviewer, "role": role, "review_ref": ref})
        if args.write:
            path = ctx.src.root / ops.BASELINE
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8", newline="\n")
            print(f"wrote {ops.BASELINE}")
        else:
            print(yaml.safe_dump(doc, sort_keys=False))
        return 0
    if not args.fixture:
        return _err("--fixture is required", 2)
    fixture = Path(args.fixture).resolve()
    if not (fixture / KIT_DIR / "kit.yml").is_file():
        return _err(f"{fixture} is not a kit project to run golden tasks on", 2)
    modes = ["parallel", "sequential"] if args.mode in (None, "both") else [args.mode]
    model = None
    if args.agent_model:
        name, _, version = args.agent_model.partition("@")
        model = {"name": name, "version": version}
    driver = golden.Command(args.agent_command, model) if args.agent_command else golden.Scripted()
    rhash = None
    if (Path(args.root).resolve() / KIT_DIR / "kit.yml").is_file():  # run for a project: tie the results to its routing policy
        from agentic_kit.__main__ import _context
        try:
            rhash = ops.results_routing_hash(_context(args))
        except KitError:
            rhash = None
    doc = golden.run(fixture, modes, driver, routing_hash=rhash)
    problems = golden.failures(doc)
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(yaml.safe_dump(doc, sort_keys=False, width=120), encoding="utf-8", newline="\n")
    if args.json:
        print(json.dumps(doc, indent=2))
    else:
        for r in doc["runs"]:
            print(f"{r['mode']} ({r['driver']}):")
            for t in r["tasks"]:
                print(f"  {'ok  ' if t.get('completed') else 'FAIL'} {t['id']}: stopped at {', '.join(t.get('stopped_at') or []) or 'no gate'}"
                      + (f" — {t['error']}" if t.get("error") else ""))
            for d in r["defects"]:
                print(f"  {'ok  ' if d.get('caught') else 'FAIL'} defect {d['id']}: " + (f"caught by {d.get('caught_by')} via {d.get('via')}" if d.get("caught") else "not caught")
                      + (f" — {d['error']}" if d.get("error") else ""))
            for i in r.get("injections") or []:
                good = i.get("reported") and not i.get("acted")
                print(f"  {'ok  ' if good else 'FAIL'} instruction planted in {i.get('channel')}: "
                      + ("acted on" if i.get("acted") else "not acted on") + ", " + ("reported" if i.get("reported") else "not reported")
                      + (f" — {i['error']}" if i.get("error") else ""))
        for p in problems:
            print(f"FAIL {p}")
        if isinstance(driver, golden.Scripted):
            print("\nThe scripted driver is a stand-in. It proves the machinery, not an agent's judgement.")
    return 1 if problems else 0


def cmd_guard(args) -> int:
    """Decide one tool call from a pre-tool-use event. Exit 2 with the reason on stderr blocks it."""
    raw = sys.stdin.read() if not sys.stdin.isatty() else "{}"
    try:
        payload = json.loads(raw or "{}")
    except ValueError:
        payload = {}
    try:
        allowed, reason = work.guard(Path(args.root), payload if isinstance(payload, dict) else {})
    except Exception as exc:  # noqa: BLE001 - a broken guard must not silently allow a write
        tool = str((payload or {}).get("tool_name") or "").lower()
        if tool in work.WRITE_TOOLS:
            return _err(f"agentic path guard failed and blocked this write: {exc}", 2)
        return 0
    if not allowed:
        return _err(f"agentic path guard: {reason}", 2)
    return 0


def _cli(sub, common) -> None:
    sp = sub.add_parser("team", help="agent specs: install, render the runtime files, brief an agent, run the team checks")
    common(sp)
    sp.add_argument("action", choices=["init", "render", "list", "brief", "check", "context", "tools"])
    sp.add_argument("--item", help="with context: the work item")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--runtimes", help="with init: comma-separated, from claude, copilot, sequential")
    sp.add_argument("--mode", choices=["parallel", "sequential"])
    sp.add_argument("--agent")
    sp.add_argument("--spec")
    sp.add_argument("--changed-files")
    sp.add_argument("--today")
    sp.set_defaults(fn=cmd_team)
    sp = sub.add_parser("work", help="work items: create from the task list, claim, hand off, review, integrate")
    common(sp, base=False)
    sp.add_argument("action", choices=["create", "list", "show", "claim", "handoff", "review", "integrate"])
    sp.add_argument("--spec", required=True)
    sp.add_argument("--item")
    sp.add_argument("--agent")
    sp.add_argument("--by")
    sp.add_argument("--worktree", action="store_true", help="with claim: work in an isolated working copy")
    sp.add_argument("--done")
    sp.add_argument("--evidence", action="append")
    sp.add_argument("--question", action="append")
    sp.add_argument("--accept", action="store_true")
    sp.add_argument("--return", dest="return_", metavar="FINDING")
    sp.add_argument("--ready", action="store_true", help="with list: items that can start now, in groups that may run together")
    sp.set_defaults(fn=cmd_work)
    sp = sub.add_parser("orchestrate", help="a run of the team: start it with a budget, record each step, stop it")
    common(sp, base=False)
    sp.add_argument("action", choices=["start", "step", "stop", "status"])
    sp.add_argument("--spec", required=True)
    sp.add_argument("--run")
    sp.add_argument("--mode", choices=["parallel", "sequential"])
    sp.add_argument("--steps", type=int)
    sp.add_argument("--minutes", type=int)
    sp.add_argument("--agent")
    sp.add_argument("--do", help="with step: what the agent did, in one word")
    sp.add_argument("--input", action="append")
    sp.add_argument("--output", action="append")
    sp.add_argument("--reason")
    sp.add_argument("--model", help="with step: the model that ran it, as name@version")
    sp.add_argument("--tools", help="with step: the tools it used, comma-separated (default: the tools its spec allows)")
    sp.add_argument("--cost", type=float, help="with step: what it cost, in the project's currency")
    sp.add_argument("--seconds", type=float, help="with step: how long it took (default: the time since the last step)")
    sp.add_argument("--gate", help="with step: the gate this work is heading for")
    sp.set_defaults(fn=cmd_orchestrate)
    sp = sub.add_parser("golden", help="run the golden tasks and seeded defects on a fixture, in both modes")
    common(sp, base=False)
    sp.add_argument("action", choices=["run", "baseline"])
    sp.add_argument("--fixture")
    sp.add_argument("--agent-model", help="with --agent-command: the model behind it, as name@version, unless the command reports it per step")
    sp.add_argument("--accepted-by", help="with baseline: reviewer:role:pull/<n>#review-<id>")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--mode", choices=["parallel", "sequential", "both"])
    sp.add_argument("--agent-command", help="run this command for each implementation and review step instead of the scripted stand-ins")
    sp.add_argument("--out", help="write the results document here")
    sp.set_defaults(fn=cmd_golden)
    sp = sub.add_parser("guard", help="decide one tool call from a pre-tool-use event read on stdin")
    sp.set_defaults(fn=cmd_guard)


core.CLI_HOOKS.append(_cli)
