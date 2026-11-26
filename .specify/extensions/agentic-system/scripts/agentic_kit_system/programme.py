"""A programme seen from its parent: one section on the page of a change (PRG-1 to PRG-12, docs/design/programme-view.md).

For a spec whose front matter has `programme`, the section shows where each child stands. For a spec that names a
`parent`, it shows the programme it is part of. It is a view: it reads, judges nothing and holds no gate.

Nothing but fixed words crosses from another repository onto the page (PRG-7): no title, no name, no text of a review.
What is read there is a tier, which gates have a decision record, and each decision, and each of the three is shown
only when it is one of the kit's own words. So a file in another repository can put no instruction on this page.
"""
from __future__ import annotations

import re

import yaml

from agentic_kit import adapters
from agentic_kit.checks_gov import spec_front
from agentic_kit.core import DECISIONS, GATES, KIT_DIR, TIERS, Context, KitError, front_matter

CHILDREN = "The children of this programme"
PART = "Part of a programme"
ASKED = 5  # how many commits of a child in this repository the adapter is asked about: the newest (PRG-4)
NOT_READABLE = "not readable"
RECORDS = ("What is shown of another repository are its records as the pinned commit holds them. "
           "Only that repository's own checks judge the reviews behind them.")
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")  # a spec's folder: a name, never a path


def _shown(value, limit: int = 80) -> str:
    """Text from this repository's own front matter, on one line and cut where it is long."""
    flat = " ".join(str(value if value is not None else "").split())
    return flat if len(flat) <= limit else flat[:limit - 3].rstrip() + "..."


def _why(exc: Exception) -> str:
    return _shown(exc, 200) or type(exc).__name__


def section(ctx: Context, spec: str) -> list[tuple[str, list[str]]]:
    """What this feature adds to the page of one change: nothing for a spec that is no parent and no child (PRG-1)."""
    front = spec_front(ctx, spec)
    out = []
    if front.get("programme"):
        out.append((CHILDREN, _children(ctx, front["programme"])))
    if front.get("parent"):
        out.append((PART, _part(ctx, spec, front["parent"])))
    return out


# ── the parent's view ───────────────────────────────────────────────────────────

def _children(ctx: Context, prog) -> list[str]:
    if not isinstance(prog, dict):
        return ["The `programme` entry of this spec's front matter is not a mapping, so no child can be read from it."]
    children = prog.get("children") if isinstance(prog.get("children"), list) else []
    rollout = [str(name) for name in prog.get("rollout") or []] if isinstance(prog.get("rollout"), list) else []
    contract = prog.get("contract")
    count = f"{len(children)} child{'ren' if len(children) != 1 else ''}"
    lines = [(f"Shared contract: `{_shown(contract)}`. " if contract else "No shared contract is named. ")
             + (f"{count}, in the rollout order." if children else "It names no child.")]

    def place(child) -> tuple[int, int]:
        name = str(child.get("spec", "")) if isinstance(child, dict) else ""
        return (rollout.index(name), 0) if name in rollout else (len(rollout), children.index(child))

    elsewhere = False
    for number, child in enumerate(sorted(children, key=place), 1):
        if not isinstance(child, dict) or not child.get("spec"):
            lines.append(f"{number}. An entry under `children` that names no spec: it is not a mapping with the key `spec`.")
            continue
        name = str(child["spec"])
        late = "" if name in rollout else " The rollout order does not include it."
        if not _NAME.fullmatch(name):
            lines.append(f"{number}. `{_shown(name)}`: not the plain name of a spec's folder, so it was not looked up.{late}")
        elif str(child.get("repo", ".")) == ".":
            try:
                lines.append(f"{number}. {_here(ctx, name)}{late}")
            except KitError as exc:  # one child that cannot be read does not take the others with it
                lines.append(f"{number}. `{name}` (this repository): it could not be read ({_why(exc)}).{late}")
        else:
            elsewhere = True
            lines.append(f"{number}. {_elsewhere(ctx, name, str(child.get('repo')), str(child.get('ref', '')))}{late}")
    if elsewhere:
        lines += ["", RECORDS]  # the empty line ends the list, so that the sentence is no part of its last entry
    return lines


def _here(ctx: Context, name: str) -> str:
    """A child in this repository: its title, its tier, where it stands on the gate board, and its pull requests (PRG-3, PRG-4)."""
    from agentic_kit import changeset, reports
    if name not in ctx.specs():
        return f"`{name}` (this repository): the folder `specs/{name}/` does not exist."
    tier = spec_front(ctx, name).get("tier_declared")
    row = reports.board(ctx, only=[name])[0]
    open_gate = next((gate for gate, state in row["gates"].items() if state in ("open", "no evidence yet")), None)
    stands = f"Open gate: {open_gate}." if open_gate else "Every gate it needs is approved."
    return (f"`{name}` (this repository): {changeset.one_line(changeset.title(ctx, name), 80)}. "
            f"Tier {tier if tier in TIERS else NOT_READABLE}. {stands} {_pulls(ctx, name)}")


def _pulls(ctx: Context, name: str) -> str:
    from agentic_kit import delivery
    try:
        if not delivery.own_repository(ctx):
            return f"Its pull requests were not asked about: {delivery.NOT_OWN}."
        found = delivery.commits(ctx, name)
    except KitError as exc:
        return f"Its commits could not be listed: {_why(exc)}."
    if not found:
        return "No commit of it is in this clone."
    asked = [row["commit"] for row in found[:ASKED]]
    left = len(found) - len(asked)
    more = (f" {left} older commit{'s were' if left != 1 else ' was'} not asked about; `changeset --spec {name}` asks about more."
            if left else "")
    try:
        pulls = adapters.enforcement(ctx).pulls(asked)
    except (KitError, OSError, ValueError) as exc:  # ValueError: what was read is not JSON
        return f"Its pull requests could not be read: {_why(exc)}.{more}"
    if not pulls:
        return f"No pull request holds its newest commit{'s' if len(asked) != 1 else ''}.{more}"
    listed = ", ".join(f"{pull.get('change')} ({pull.get('state')})" for pull in pulls)
    return f"Pull requests: {listed}.{more}"


def _elsewhere(ctx: Context, name: str, repo: str, ref: str) -> str:
    """A child in another repository, as its pinned commit holds it (PRG-5 to PRG-9). Up to fourteen requests."""
    if not adapters.REPO_NAME.fullmatch(repo):
        return f"`{name}`: its repository is not named as `owner/name`, so it was not asked about."
    if not adapters.COMMIT_ID.fullmatch(ref):
        return f"`{name}` in `{repo}`: it is not pinned to a commit id, so it was not asked about."
    head = f"`{name}` in `{repo}`, pinned to `{ref[:7]}`"
    try:
        adapter = adapters.enforcement(ctx)
        pin = adapter.commit_at(repo, ref)
        specs = adapter.folder_at(repo, pin, "specs") or {}
        if name not in specs:
            return f"{head}: the pinned commit holds no `specs/{name}/`."
        tier = _tier(adapter.file_at(repo, pin, f"specs/{name}/spec.md"))
        gates = _recorded(adapter, repo, pin, name)
        behind = _behind(adapter, repo, pin, name, specs[name])
    except (KitError, OSError, ValueError) as exc:
        return f"{head}: it could not be read ({_why(exc)})."
    recorded = ", ".join(f"{gate} {decision}" for gate, decision in gates) or "no gate decision"
    return f"{head}: tier {tier}; recorded there at that commit: {recorded}. {behind}"


def _tier(text: str | None) -> str:
    try:
        tier = front_matter(text or "").get("tier_declared")
    except KitError:
        return NOT_READABLE
    return tier if isinstance(tier, str) and tier in TIERS else NOT_READABLE


def _recorded(adapter, repo: str, pin: str, name: str) -> list[tuple[str, str]]:
    """Each gate that has a decision record at the pin, with its decision when that is one of the kit's own words (PRG-7)."""
    folder = f"{KIT_DIR}/decisions/{name}"
    names = adapter.folder_at(repo, pin, folder) or {}
    out = []
    for gate in GATES[1:]:  # only the kit's own gates are looked for, whatever the folder holds
        if f"{gate}.yml" not in names:
            continue
        try:
            record = yaml.safe_load(adapter.file_at(repo, pin, f"{folder}/{gate}.yml") or "")
        except yaml.YAMLError:
            record = None
        decision = record.get("decision") if isinstance(record, dict) else None
        out.append((gate, decision if isinstance(decision, str) and decision in DECISIONS else NOT_READABLE))
    return out


def _behind(adapter, repo: str, pin: str, name: str, spec_id: str) -> str:
    """Is the child, at the head of its repository's default branch, something else than at the pin (PRG-6)?"""
    records = f"{KIT_DIR}/decisions"
    try:
        now = [(adapter.folder_at(repo, "", "specs") or {}).get(name), (adapter.folder_at(repo, "", records) or {}).get(name)]
        then = [spec_id, (adapter.folder_at(repo, pin, records) or {}).get(name)]
    except (KitError, OSError, ValueError) as exc:
        return f"Whether the pin is behind could not be read ({_why(exc)})."
    if now[0] is None:
        return "The pin is behind: the default branch no longer holds the child's spec folder. Moving the pin is a person's decision."
    changed = [what for what, a, b in (("spec folder", then[0], now[0]), ("decision records", then[1], now[1])) if a != b]
    if not changed:
        return "The pin is current: the default branch holds the child's spec folder and its decision records as the pin does."
    verb = "has" if changed == ["spec folder"] else "have"
    return (f"The pin is behind: the child's {' and its '.join(changed)} {verb} changed on the default branch since. "
            "Moving the pin is a person's decision.")


# ── the child's view ────────────────────────────────────────────────────────────

def _part(ctx: Context, spec: str, parent) -> list[str]:
    """The programme a child is part of: its parent, the shared contract, and its place in the rollout order (PRG-10)."""
    from agentic_kit import changeset
    parent = str(parent)
    if not _NAME.fullmatch(parent):
        return [f"This spec names the parent `{_shown(parent)}`, which is not the plain name of a spec's folder."]
    if parent not in ctx.specs():
        return [f"This spec names the parent `{parent}`, and the folder `specs/{parent}/` does not exist."]
    prog = spec_front(ctx, parent).get("programme")
    prog = prog if isinstance(prog, dict) else {}
    children = [str(child.get("spec", "")) for child in prog.get("children") or [] if isinstance(child, dict)] \
        if isinstance(prog.get("children"), list) else []
    lines = [f"Parent: `{parent}`, {changeset.one_line(changeset.title(ctx, parent), 80)}."]
    if spec not in children:
        return lines + [f"`{parent}` does not list this spec among its children."]
    rollout = [str(name) for name in prog.get("rollout") or []] if isinstance(prog.get("rollout"), list) else []
    contract = prog.get("contract")
    lines.append(f"Shared contract: `{_shown(contract)}`." if contract else "The parent names no shared contract.")
    order = [name for name in rollout if name in children]
    lines.append(f"Place in the rollout order: {order.index(spec) + 1} of {len(children)}." if spec in order
                 else f"The parent's rollout order does not include this spec. The programme has {len(children)} children.")
    return lines
