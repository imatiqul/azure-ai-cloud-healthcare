"""agentic-spec-kit connect extension (slice 0.6): requirements in from any tracker, the kit run by any pipeline,
people told through chat, mail and the work item itself.

Importing this package registers its checks and commands. It builds on the product extension (intake records).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from agentic_kit import core

try:
    import agentic_kit_product  # noqa: F401  (intake records and duplicate detection live there)
except ImportError as exc:  # pragma: no cover - an installation problem, reported plainly
    raise ImportError("the agentic-connect extension needs the agentic-product extension installed beside it") from exc

from . import checks, notify, pipeline, sample, trackers
from .checks import CONNECT, SCHEMA
from .transport import Http, redact

__version__ = "0.6.0"

CONNECT_CHECKS = ["CK-CONNECT-CONFIG", "CK-NOTIFY-CONTENT", "CK-PIPELINE-SECRETS"]

#: Test seams. In normal use these stay None and the real network, mail server and environment are used.
TRANSPORT = None
SMTP = None
ENV = None

SKELETON = f"""schema: {SCHEMA}
# Where requirements come from. Secrets are NAMED here and supplied by the pipeline's secret store; never write a value.
sources: []
#  - {{id: backlog, platform: jira, base_url: "https://<site>.atlassian.net", query: 'project = ABC AND labels = "spec-ready"',
#     auth: {{user_env: JIRA_USER, token_env: JIRA_TOKEN}}}}
#  - {{id: boards, platform: ado, organization: <org>, project: <project>,
#     wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'spec-ready'", auth: {{token_env: ADO_TOKEN}}}}
#  - {{id: tasks, platform: clickup, list: "<list id>", auth: {{token_env: CLICKUP_TOKEN}}}}
#  - {{id: issues, platform: github, repo: <owner/name>, labels: [spec-ready], auth: {{token_env: TRACKER_GITHUB_TOKEN}}}}
#  - {{id: inbox, platform: document, paths: ["requirements/inbox/*"]}}   # Markdown, text, HTML, CSV, JSON; an exported Claude artifact goes here
notify:
  channels: []
#    - {{id: chat, type: slack, webhook_env: SLACK_WEBHOOK_URL}}
#    - {{id: teams, type: teams, webhook_env: TEAMS_WEBHOOK_URL}}       # a Workflows webhook
#    - {{id: mail, type: email, smtp: {{host_env: SMTP_HOST, port: 587, user_env: SMTP_USER, password_env: SMTP_PASSWORD, from: kit@example.com}}, to: [team@example.com]}}
#    - {{id: origin, type: work-item}}                                   # a note on the work item the spec came from
  routes: []
#    - {{events: [gate-ready, gate-approved, gate-rejected, released], channels: [chat, origin]}}
#    - {{events: [check-failed, deadline, source-changed, duplicate-candidate, intake-new], channels: [teams, mail]}}
  links: {{repository: "", branch: main}}
# Other secrets the pipeline holds that an agent step must never see (for example a token that can push).
pipeline_secrets: []
"""


def config(ctx) -> dict | None:
    """connect.yml as the pipeline reads it: from the base branch, so a change cannot point a secret at a new address.

    Where the base branch has none, the copy the change brings is read, so that the change which adds the file can be
    looked at. Nothing is sent on the strength of that copy: see `sending`."""
    holder = ctx.trusted if ctx.trusted.exists(CONNECT) else ctx.src
    if not holder.exists(CONNECT):
        return None
    data = holder.yaml(CONNECT)
    if not isinstance(data, dict):
        raise core.KitError(f"{CONNECT} must be a mapping")
    return data


def sending(ctx) -> dict | None:
    """connect.yml for anything that sends with a credential (REV-2). Where a base branch is given, only its copy counts:
    a file that arrives with a change names addresses nobody has merged, and the job that sends holds the secrets."""
    if ctx.trusted.ref is None:
        return config(ctx)
    return config(ctx) if ctx.trusted.exists(CONNECT) else None


def _not_merged(ctx) -> str:
    return (f"{CONNECT} is not on {ctx.trusted.ref}, the base branch, so nothing is sent with it: "
            "the addresses and secret names of a change count once the change is merged")


def _register() -> None:
    from agentic_kit import checks_gov
    core.SAMPLE_HOOKS.append(sample.extend_sample)
    core.FIXTURE_HOOKS.append(sample.fixtures)
    if CONNECT not in checks_gov.PROTECTED:
        checks_gov.PROTECTED.append(CONNECT)


_register()


def _need_config(ctx) -> dict:
    cfg = config(ctx)
    if cfg is None:
        raise core.KitError(f"{CONNECT} is missing; run `connect init --write` and fill it in")
    return cfg


def cmd_connect(args) -> int:
    from agentic_kit.__main__ import _context, _report
    ctx = _context(args)
    transport = TRANSPORT or Http()
    env = ENV if ENV is not None else os.environ
    a = args.action
    if a == "check":
        return _report([core.run_check(c, ctx) for c in CONNECT_CHECKS], args.json)
    if a == "init":
        if ctx.src.exists(CONNECT):
            print(f"{CONNECT} already exists; it is not overwritten")
            return 0
        if args.write:
            path = ctx.src.root / CONNECT
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(SKELETON, encoding="utf-8", newline="\n")
        print(("wrote " if args.write else "would write ") + CONNECT)
        print("Pipeline templates are under .specify/extensions/agentic-connect/ci/. Copy the one for your CI system; see docs/adapters/pipeline.md.")
        return 0
    cfg = _need_config(ctx)
    if a == "fetch":
        if sending(ctx) is None:
            print(f"cannot fetch: {_not_merged(ctx)}", file=sys.stderr)
            return 2
        try:
            rows = trackers.fetch_sources(ctx, cfg.get("sources") or [], transport, env, only=args.source, write=not args.dry_run)
        except core.KitError as exc:
            print(f"cannot fetch: {redact(str(exc), [str(v) for v in env.values() if v and len(str(v)) > 7 and str(v) in str(exc)])}", file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps(rows, indent=2))
        else:
            for r in rows:
                print(f"{r['action']:15} {r['id']}" + (f"  (removed before writing: {r['screened']})" if r["screened"] else "")
                      + ("  (discussion moved)" if r["discussion"] == "moved" else ""))
            print(f"{len(rows)} item(s) from {len({r['source'] for r in rows})} source(s); "
                  f"{sum(r['action'] == 'new' for r in rows)} new, {sum(r['action'] == 'source-changed' for r in rows)} changed after work began, "
                  f"{sum(r['discussion'] == 'moved' for r in rows)} with a discussion that moved after work began")
        return 0
    if a == "events":
        for e in notify.detect(ctx, None, args.commit or ""):
            print(f"{e.type:20} {notify.title(e, (cfg.get('notify') or {}).get('templates'))}")
        return 0
    if a == "mirror":
        if not args.change or not args.commit:
            print("--change pull/<n> and --commit <sha> are required", file=sys.stderr)
            return 2
        rows = pipeline.mirror(ctx, args.change, args.commit, write=args.write)
        if args.json:
            print(json.dumps(rows, indent=2))
        for r in rows:
            state = "recorded" if r["written"] else ("waiting for " + ", ".join(r["missing"]) if r["missing"] else "ready to record (add --write)")
            if r.get("note"):
                state = f"not recorded: {r['note']}"
            elif r.get("exception"):
                state += ", with the single-approver exception: a reviewer also wrote the change"
            if not args.json:
                print(f"{r['spec']} {r['gate']}: {r['decision']} - {state}")
        if not rows and not args.json:
            print("no review on this change carries an approval line for the current evidence of an open gate")
        return 0
    if a in ("run", "notify"):
        results = pipeline.run_checks(ctx)
        events = notify.detect(ctx, results, args.commit or "")
        deliveries, held = [], ""
        if args.notify or a == "notify":
            live = sending(ctx)
            if live is None:
                cfg, held = {}, _not_merged(ctx)  # nor do the templates of a file nobody merged shape what this job writes
            else:
                deliveries = notify.deliver(ctx, live, events, transport, env, Path(args.ledger) if args.ledger else None, SMTP, args.pr_url or "")
            if args.ledger:  # a pipeline keeps this file between runs; with nothing sent there would be nothing to keep (LIV-8)
                Path(args.ledger).parent.mkdir(parents=True, exist_ok=True)
                Path(args.ledger).touch()
        text = pipeline.summary(ctx, results, events, deliveries, (cfg.get("notify") or {}).get("templates"))
        if held:
            text += f"\n## Notifications\n- none: {held}\n"
        if args.summary:
            with open(args.summary, "a", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
        if args.json:
            print(json.dumps({"ok": pipeline.exit_code(ctx, results) == 0, "results": [r.as_dict() for r in results],
                              "events": [{"type": e.type, "key": e.key, "spec": e.spec, "gate": e.gate, "facts": e.facts} for e in events],
                              "notifications": [{k: v for k, v in d.items() if k != "text"} for d in deliveries],
                              **({"not_sent": held} if held else {})}, indent=2))
        else:
            print(text)
        if a == "notify":  # this job reports on delivery; the check result belongs to the job that ran `connect run` or `check`
            return 1 if any(str(d["status"]).startswith("failed") for d in deliveries) else 0
        return pipeline.exit_code(ctx, results)
    return 2


def _cli(sub, common_args) -> None:
    sp = sub.add_parser("connect", help="trackers, pipelines and notifications: fetch requirements, run in CI, mirror reviews, notify people")
    common_args(sp)
    sp.add_argument("action", choices=["init", "check", "fetch", "run", "notify", "events", "mirror"])
    sp.add_argument("--source", help="fetch one source only")
    sp.add_argument("--dry-run", action="store_true", help="fetch without writing intake records")
    sp.add_argument("--notify", action="store_true", help="send the events of this run to the configured channels")
    sp.add_argument("--ledger", help="a file that remembers what was already sent, so a re-run does not repeat it")
    sp.add_argument("--summary", help="append a Markdown summary to this file (for example $GITHUB_STEP_SUMMARY)")
    sp.add_argument("--commit", help="the commit this run is about")
    sp.add_argument("--pr-url", help="the pull request to link to")
    sp.add_argument("--change", help="pull/<n>, for mirror")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--today")
    sp.add_argument("--changed-files")
    from agentic_kit.__main__ import BRANCH_HELP
    sp.add_argument("--branch", help="with run and notify: " + BRANCH_HELP)
    sp.set_defaults(fn=cmd_connect)


core.CLI_HOOKS.append(_cli)
