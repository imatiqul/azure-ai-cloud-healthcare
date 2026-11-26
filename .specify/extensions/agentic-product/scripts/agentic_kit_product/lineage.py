"""Lineage (TRC-19): from a line of code back to who asked for it and who approved it."""
from __future__ import annotations

import re
import subprocess

from agentic_kit import core
from agentic_kit.core import KIT_DIR, Context, match_any
from agentic_kit.lanes import approved_records, principles

from . import common
from .dedupe import origin
from .intake import records
from .living import spec_deltas

_TRAILER = re.compile(r"^(Work-Item|Agent):\s*(.+)$", re.M)


def _git(ctx: Context, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(ctx.src.root), *args], capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else ""


def last_change(ctx: Context, path: str, line: int | None) -> dict:
    """The commit that last changed the file (or the line), with the work item and agent its message names."""
    if line:
        out = _git(ctx, "log", "-1", f"-L{line},{line}:{path}", "--format=%H%n%an%n%ad%n%B", "--date=short", "-s")
    else:
        out = _git(ctx, "log", "-1", "--format=%H%n%an%n%ad%n%B", "--date=short", "--", path)
    parts = out.split("\n", 3)
    if len(parts) < 3 or not parts[0]:
        return {}
    info = {"commit": parts[0], "author": parts[1], "date": parts[2]}
    for name, value in _TRAILER.findall(parts[3] if len(parts) > 3 else ""):
        info[name.lower().replace("-", "_")] = value.strip()
    return info


def specs_for(ctx: Context, path: str) -> list[str]:
    """The specs that claim a path: by the paths they name, by their task lists, by the components they say they touch."""
    out = []
    for spec in ctx.specs():
        globs = [str(g) for g in (common.front(ctx, spec).get("paths") or [])]
        for hook in core.ARTIFACT_HOOKS:
            globs += hook(ctx, spec)
        if match_any(path, globs):
            out.append(spec)
    return out


_CARRIES = re.compile(r"Carries:\s*((?:AC-[0-9]{3,}[,\s]*)+)")


def carried_by(ctx: Context, spec: str, item_id: str) -> list[str]:
    """The acceptance criteria a task carries: from its work item, or from its line in the task list."""
    work = f"{KIT_DIR}/work/{spec}/{item_id}.yml"
    if ctx.src.exists(work):
        recorded = [str(c) for c in ((ctx.src.yaml(work) or {}).get("carries") or [])]
        if recorded:
            return recorded
    rel = f"specs/{spec}/tasks.md"
    if ctx.src.exists(rel):
        for line in ctx.src.read(rel).splitlines():
            if re.match(rf"\s*[-*]\s*\[[ xX]\]\s*{re.escape(item_id)}\b", line):
                found = _CARRIES.search(line)
                return re.findall(r"AC-[0-9]{3,}", found.group(1)) if found else []
    return []


def why(ctx: Context, target: str) -> str:
    path, _, raw = target.partition(":")
    line = int(raw) if raw.isdigit() else None
    lines = [f"# Why `{target}` is the way it is", ""]
    change = last_change(ctx, path, line)
    item_spec = item_id = None
    if change:
        lines.append(f"- **Last changed:** {change['date']} in `{change['commit'][:10]}` by {change['author']}"
                     + (f", agent {change['agent']}" if change.get("agent") else ""))
        if change.get("work_item"):
            item_spec, _, item_id = change["work_item"].partition("/")
            lines.append(f"- **Work item:** {change['work_item']}")
    else:
        lines.append("- **Last changed:** not known (no git history for this path)")
    if item_spec and item_spec in ctx.specs():
        specs = [item_spec]  # the commit says which spec's task changed it
    else:
        specs = specs_for(ctx, path)
    titles = principles(ctx.src.read(".specify/memory/constitution.md")) if ctx.src.exists(".specify/memory/constitution.md") else {}
    if not specs:
        lines += ["", "No spec claims this path. It is either older than the kit or changed outside a spec (see CK-DRIFT-SPEC)."]
        return "\n".join(lines) + "\n"
    intake_by_id = {str(r.get("id")): r for _, r in records(ctx)}
    for spec in specs:
        lines += ["", f"## Spec {spec}: {common.spec_title(ctx, spec)}"]
        frs, acs = common.requirements(ctx, spec), common.criteria(ctx, spec)
        carried: list[str] = []
        if item_id and spec == item_spec:
            carried = carried_by(ctx, spec, item_id)
            lines.append(f"- **Task {item_id} carries:** {', '.join(carried) or 'no acceptance criterion'}")
        wanted = sorted({f for a in carried for f in (acs.get(a) or ([], ""))[0]}) or sorted(frs)
        for fid in wanted:
            lines.append(f"- **{fid}:** {frs.get(fid, '(not in the spec)')}")
        for pid in [str(p) for p in common.front(ctx, spec).get("principles") or []]:
            title = (titles.get(pid) or "").splitlines()[0] if titles.get(pid) else "(not in the constitution)"
            lines.append(f"- **Principle {pid}:** {title}")
        for hook in core.WHY_HOOKS:
            lines += hook(ctx, path, spec)
        for d in spec_deltas(ctx, spec):
            for r in d.added + d.modified:
                if not wanted or set(r.verifies) & set(wanted):
                    lines.append(f"- **Behaviour:** capability `{d.capability}`, requirement '{r.name}'")
        for rid in [str(i) for i in origin(ctx, spec).get("intake") or []]:
            src = (intake_by_id.get(rid) or {}).get("source") or {}
            lines.append(f"- **Asked for in:** {src.get('platform', 'unknown')} {src.get('key', rid)}" + (f" ({src['url']})" if src.get("url") else ""))
        approvals = approved_records(ctx, spec)
        for gate in sorted(approvals):
            people = ", ".join(f"{a.get('reviewer')} as {a.get('role')} ({a.get('review_ref')})" for a in approvals[gate][1].get("approvals") or [])
            lines.append(f"- **{gate} approved by:** {people or 'nobody recorded'}")
        if not approvals:
            lines.append("- **Approvals:** none recorded yet")
    return "\n".join(lines) + "\n"
