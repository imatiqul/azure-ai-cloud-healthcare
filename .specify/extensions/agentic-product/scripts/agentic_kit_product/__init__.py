"""agentic-spec-kit product extension (slice 0.5): from a requirement to the truth about what the system does.

Intake records, requirement quality, living capability specs fed by deltas, duplicate detection decided by a
person, outcomes, sealing of finished changes, and lineage. Importing this package registers its checks and commands.
"""
from __future__ import annotations

import json
import sys

import yaml

from agentic_kit import core

from . import common, conversation, dedupe, intake, lineage, lint, living, outcomes, sample

__version__ = "0.5.0"

PRODUCT_CHECKS = ["CK-INTAKE-RECORD", "CK-INTAKE-DRIFT", "CK-REQ-QUALITY", "CK-SPEC-SIZE", "CK-GLOSSARY", "CK-DUPLICATE", "CK-DELTA-VALID",
                  "CK-CAPABILITY-COVERAGE", "CK-LIVING-SPEC", "CK-DELTA-MERGED", "CK-SPEC-COLLISION", "CK-ARCHIVE", "CK-OUTCOME",
                  "CK-CONVERSATION"]
SPEC_EVIDENCE = ["deltas/*", dedupe.ORIGIN, outcomes.OUTCOMES]  # what the first gates bind besides spec.md
GLOSSARY_SKELETON = """schema: agentic-glossary/1
# One entry per idea the product talks about. `avoid` lists words people use for the same idea; specs must use `term`.
terms: []
#  - term: member
#    definition: A person with an active account.
#    avoid: [customer, client]
"""


def catalog(ctx) -> str:
    caps = living.capabilities(ctx)
    lines = ["# Capabilities", "", "What the system does today, from the living specs.", "",
             "| Capability | Owner | Requirements | Components | Last changed by |", "|---|---|---|---|---|"]
    for cid, cap in sorted(caps.items()):
        last = [r.sources[-1] for r in cap.requirements.values() if r.sources]
        lines.append(f"| `{cid}` {cap.front.get('title', '')} | {cap.front.get('owner_role', '')} | {len(cap.requirements)} | "
                     f"{', '.join(str(n) for n in cap.front.get('nodes') or []) or '-'} | {last[-1] if last else '-'} |")
    if not caps:
        lines.append("| (none yet) | | | | |")
    return "\n".join(lines) + "\n"


def brief_hook(ctx, spec: str, gate: str) -> list[tuple[str, list[str]]]:
    """What a reviewer most needs at the first gates: how behaviour changes, and what this might duplicate."""
    if gate not in ("G1", "G2", "G4") or common.index(ctx) is None:
        return []
    caps = living.capabilities(ctx)
    change = []
    for d in living.spec_deltas(ctx, spec):
        new = "" if d.capability in caps else " (new capability)"
        for label, items in (("adds", [r.name for r in d.added]), ("changes", [r.name for r in d.modified]),
                             ("removes", [r.name for r in d.removed]), ("renames", [f"{a} to {b}" for a, b in d.renamed])):
            if items:
                change.append(f"- `{d.capability}`{new} {label}: {'; '.join(items)}")
    if not change:
        front = common.front(ctx, spec)
        change = [f"- No behaviour change is declared ({front.get('behaviour_reason', 'no reason given')})." if front.get("behaviour") == "none"
                  else "- The spec carries no delta yet."]
    decided = {str(d.get("target")): d for d in dedupe.origin(ctx, spec).get("dispositions") or [] if isinstance(d, dict)}
    similar = []
    for c in dedupe.spec_candidates(ctx, spec):
        d = decided.get(c["target"])
        similar.append(f"- {dedupe.describe(c)}: " + (f"decided {d.get('decision')} by {(d.get('decided_by') or {}).get('reviewer')}" if d else "NOT DECIDED"))
    return [("Behaviour change", change), ("Similar work", similar or ["- Nothing similar was found by the kit's word comparison."])]


def _register() -> None:
    from agentic_kit import __main__ as cli
    from agentic_kit import selftest
    for gate in ("G1", "G2"):
        cli.DEFAULT_EVIDENCE[gate] += [f for f in SPEC_EVIDENCE if f not in cli.DEFAULT_EVIDENCE[gate]]
        plan = selftest.GATE_PLAN[gate][0]
        plan += [f for f in sample.SPEC_FILES if f not in plan]
    core.SAMPLE_HOOKS.append(sample.extend_sample)
    core.FIXTURE_HOOKS.append(sample.fixtures)
    core.BRIEF_HOOKS.append(brief_hook)
    core.BRIEF_HOOKS.append(conversation.brief_hook)          # the summary of what was said, at the first gate (CNV-12)
    core.CHANGESET_HOOKS.append(conversation.changeset_hook)  # and on a change's page (CNV-13)
    core.VIEW_HOOKS["capabilities"] = catalog


_register()


# ── commands ────────────────────────────────────────────────────────────────────

def _write(ctx, rel: str, text: str) -> None:
    path = ctx.src.root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def delta_skeleton(ctx, spec: str, capability: str) -> str:
    """A delta drafted from the spec's requirements and criteria, for a person or an agent to finish."""
    caps = living.capabilities(ctx)
    frs, acs = common.requirements(ctx, spec), common.criteria(ctx, spec)
    head = {"capability": capability}
    if capability not in caps:
        head.update({"title": capability.replace("-", " ").capitalize(), "owner_role": common.front(ctx, spec).get("owner_role", "TBD"),
                     "purpose": "TBD: one sentence on what this capability is for.", "nodes": [str(t) for t in common.front(ctx, spec).get("touches") or []]})
    lines = ["---", yaml.safe_dump(head, sort_keys=False).strip(), "---", "## ADDED Requirements"]
    for fid, statement in frs.items():
        name = " ".join(statement.rstrip(".").split()[:8]) or fid
        lines += ["", f"### Requirement: {name}", f"Verifies: {fid}", statement.replace(" MUST ", " SHALL ")]
        for aid, (verified, text) in acs.items():
            if fid in verified:
                steps = [s.strip(" ,.") for s in __import__("re").split(r"(?i)\b(?=given |when |then |and )", text) if s.strip(" ,.")]
                lines += ["", f"#### Scenario: {aid}"] + [f"- {s[0].upper() + s[1:]}" for s in steps]
    lines += ["", "<!-- Move a requirement that changes existing behaviour under '## MODIFIED Requirements', with its full new text.",
              "     List one that goes away under '## REMOVED Requirements' with a `Reason:` line. -->"]
    return "\n".join(lines) + "\n"


def cmd_product(args) -> int:
    from agentic_kit.__main__ import _context, _report
    ctx = _context(args)
    a = args.action
    try:
        if a == "check":
            return _report([core.run_check(c, ctx) for c in PRODUCT_CHECKS], args.json)
        if a == "lint":
            return _report([core.run_check(c, ctx) for c in ("CK-REQ-QUALITY", "CK-SPEC-SIZE", "CK-GLOSSARY")], args.json)
        if a == "catalog":
            print(catalog(ctx))
            return 0
        if a == "init":
            todo = {}
            if not ctx.src.exists(common.INDEX):
                todo[common.INDEX] = yaml.safe_dump({"schema": common.INDEX_SCHEMA, "exempt": ctx.specs(), "order": []}, sort_keys=False)
            if not ctx.src.exists(common.GLOSSARY):
                todo[common.GLOSSARY] = GLOSSARY_SKELETON
            for rel, text in todo.items():
                if args.write:
                    _write(ctx, rel, text)
                print(("wrote " if args.write else "would write ") + rel)
            if not todo:
                print("the product index and glossary already exist")
            elif not args.write:
                print("add --write to create them. Specs listed under `exempt` existed before adoption and are left alone;\n"
                      "remove any you want the product checks to cover.")
            return 0
        if a == "duplicates":
            if args.spec:
                found = dedupe.spec_candidates(ctx, args.spec)
            elif args.intake:
                rec = next((r for _, r in intake.records(ctx) if str(r.get("id")) == args.intake), None)
                if rec is None:
                    print(f"no intake record {args.intake}", file=sys.stderr)
                    return 2
                found = dedupe.candidates(ctx, str(rec.get("title", "")), str(rec.get("body", "")), {args.intake, str(rec.get("spec", ""))})
            elif args.title:
                found = dedupe.candidates(ctx, args.title, args.body or "")
            else:
                print("give --spec, --intake or --title", file=sys.stderr)
                return 2
            if args.json:
                print(json.dumps(found, indent=2))
            else:
                for c in found:
                    print(f"{c['strength']:9} {dedupe.describe(c)}")
                print(f"{len(found)} candidate(s) at or above {dedupe.threshold(ctx):.2f}. The comparison matches shared words, not meaning:"
                      " search the catalog for the same idea in other words, and list what you find under `candidates:` in origin.yml.")
            return 0
        if a == "merge":
            if args.adoption:
                try:
                    reviewer, role, ref = (args.approved_by or "").split(":", 2)
                except ValueError:
                    print("--approved-by must be reviewer:role:pull/<n>#review-<id>", file=sys.stderr)
                    return 2
                files, record = living.merge(ctx, None, {"reviewer": reviewer, "role": role, "review_ref": ref}, write=args.write)
            elif args.spec:
                files, record = living.merge(ctx, args.spec, write=args.write)
            else:
                print("give --spec <id> or --adoption", file=sys.stderr)
                return 2
            for rel in files:
                print(("wrote " if args.write else "would write ") + rel)
            for cap, r in record["result"].items():
                print(f"  {cap}: +{len(r['added'])} added, {len(r['modified'])} modified, {len(r['removed'])} removed, {len(r['renamed'])} renamed")
            return 0
        if not args.spec:
            print("--spec is required", file=sys.stderr)
            return 2
        if a == "conversation":
            return conversation.command(ctx, args)
        if a == "archive":
            record = living.seal(ctx, args.spec, write=args.write)
            print(f"{'sealed' if args.write else 'would seal'} {args.spec}: {len(record['files'])} file(s)")
            return 0
        if a == "delta":
            if not args.capability:
                print("--capability is required", file=sys.stderr)
                return 2
            rel = f"specs/{args.spec}/deltas/{args.capability}.md"
            if ctx.src.exists(rel):
                print(f"{rel} already exists; it is not overwritten", file=sys.stderr)
                return 2
            text = delta_skeleton(ctx, args.spec, args.capability)
            if args.write:
                _write(ctx, rel, text)
                print(f"wrote {rel}")
            else:
                print(text)
            return 0
        if a == "specify":
            if not args.intake:
                print("--intake is required", file=sys.stderr)
                return 2
            found = next(((rel, r) for rel, r in intake.records(ctx) if str(r.get("id")) == args.intake), None)
            if found is None or not ctx.src.exists(f"specs/{args.spec}/spec.md"):
                print("the intake record and the spec must both exist", file=sys.stderr)
                return 2
            rel, rec = found
            if rec.get("status") in intake.CLOSED:
                print(f"{args.intake} is closed as {rec.get('status')}; reopen it before specifying it", file=sys.stderr)
                return 2
            org = dedupe.origin(ctx, args.spec) or {"schema": "agentic-origin/1", "intake": [], "dispositions": []}
            if args.intake not in [str(i) for i in org.get("intake") or []]:
                org["intake"] = list(org.get("intake") or []) + [args.intake]
            rec.update({"status": "specified", "spec": args.spec})
            if args.write:
                _write(ctx, f"specs/{args.spec}/{dedupe.ORIGIN}", yaml.safe_dump(org, sort_keys=False))
                _write(ctx, rel, yaml.safe_dump(rec, sort_keys=False, allow_unicode=True))
            print(f"{'linked' if args.write else 'would link'} {args.intake} to {args.spec}")
            for c in dedupe.spec_candidates(ctx, args.spec):
                print(f"  to decide before the first gate: {dedupe.describe(c)}")
            return 0
    except core.KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 2


def cmd_intake(args) -> int:
    from agentic_kit.__main__ import _context
    ctx = _context(args)
    if args.action == "list":
        for rel, rec in intake.records(ctx):
            changed = " (source changed)" if (rec.get("latest") or {}).get("hash") not in (None, rec.get("hash")) else ""
            changed += " (discussion moved)" if conversation.moved(rec) else ""
            print(f"{rec.get('status', '?'):10} {rec.get('id')}  {rec.get('title', '')[:70]}{changed}")
        return 0
    threads = list(dict.fromkeys(str(u).strip() for u in args.thread or []))  # where the request was talked about (CNV-5)
    try:
        refused = conversation.refused(threads, intake.screens(ctx), "thread link") if threads else []
    except core.KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if refused:
        print("; ".join(refused) + conversation.REFUSED, file=sys.stderr)
        return 2
    if not args.title:
        rid = intake.record_id(args.platform, args.key) if threads and args.key else ""
        if not rid:
            print("--title is required. To put a link on a record that exists, give --thread with its --platform and --key", file=sys.stderr)
            return 2
        if not ctx.src.exists(intake.path_of(rid)):
            print(f"no intake record {rid}; give --title to add one", file=sys.stderr)
            return 2
        added = conversation.add_threads(ctx.src.root, rid, threads)
        print(f"{'linked' if added else 'unchanged'}: {intake.path_of(rid)} ({len(added)} thread link(s) added)")
        return 0
    try:
        # With no key given, the id comes from a hash of the text, not from the title: an id is shown in notifications.
        key = args.key or intake.content_hash(args.title, args.body or "")[7:17]
        rec = intake.make_record(args.platform, key, args.title, args.body or "", url=args.url or "",
                                 fetched=ctx.options.get("today"), patterns=intake.screens(ctx))
    except core.KitError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    rel, action = intake.upsert(ctx.src.root, rec)
    added = conversation.add_threads(ctx.src.root, rec["id"], threads) if threads else []
    print(f"{action}: {rel}" + (f" (removed before writing: {rec['screened']})" if rec.get("screened") else "")
          + (f" ({len(added)} thread link(s) added)" if threads else ""))
    for c in dedupe.candidates(ctx, rec["title"], rec["body"], {rec["id"]}):
        print(f"  looks like: {dedupe.describe(c)}")
    return 0


def cmd_why(args) -> int:
    from agentic_kit.__main__ import _context
    print(lineage.why(_context(args), args.target))
    return 0


def _cli(sub, common_args) -> None:
    sp = sub.add_parser("product", help="living capability specs: lint, deltas, duplicates, merge on release, seal, catalog; the conversation behind a change")
    common_args(sp)
    sp.add_argument("action", choices=["init", "check", "lint", "delta", "duplicates", "specify", "merge", "archive", "catalog", "conversation"])
    sp.add_argument("--spec")
    sp.add_argument("--capability")
    sp.add_argument("--intake")
    sp.add_argument("--title")
    sp.add_argument("--body")
    sp.add_argument("--adoption", action="store_true")
    sp.add_argument("--approved-by")
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--today")
    sp.add_argument("--summary", help="conversation: a few lines on what was asked, by whom, what was agreed and what was left open")
    sp.add_argument("--link", action="append", help="conversation: an address where the conversation is; may be given more than once")
    sp.add_argument("--person", action="append", help="conversation: someone who took part, as an id or a name; may be given more than once")
    sp.add_argument("--captured-by", help="conversation: who wrote the summary, a person's id or an agent's")
    sp.add_argument("--confirmed-by", help="conversation: the person, listed in roles.yml, who confirms that the summary says what was said")
    sp.set_defaults(fn=cmd_product)
    si = sub.add_parser("intake", help="incoming requirements: add one by hand, or list them")
    common_args(si)
    si.add_argument("action", choices=["add", "list"])
    si.add_argument("--title")
    si.add_argument("--body")
    si.add_argument("--platform", default="manual", choices=intake.PLATFORMS)
    si.add_argument("--key")
    si.add_argument("--url")
    si.add_argument("--thread", action="append", help="an address where the request was talked about; may be given more than once")
    si.add_argument("--today")
    si.set_defaults(fn=cmd_intake)
    sw = sub.add_parser("why", help="trace a file or a line back to the requirement, the request and the approvals behind it")
    common_args(sw)
    sw.add_argument("target", help="path, or path:line")
    sw.set_defaults(fn=cmd_why)


core.CLI_HOOKS.append(_cli)
