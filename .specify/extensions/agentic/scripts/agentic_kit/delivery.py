"""The branches and pull requests that deliver one change (DLV-4 to DLV-10, docs/design/changeset.md).

Nothing here is typed in. The commits of a change are found in git: those whose message names a work item of the
spec, and those that changed the spec's folder. The branches are the ones the work items record and the ones that
hold those commits. The pull requests are what the enforcement adapter says hold them.

The ledger only reads. It fetches nothing, and it asks the adapter through `pulls` alone. Git is asked only where
the project root is the top of a repository of its own: in a folder of another repository the commits would be
that repository's. Nothing here has read GitHub.
"""
from __future__ import annotations

import copy
import re
import subprocess

from . import adapters
from .checks_gov import default_branch, own_repository
from .core import KIT_DIR, Context, KitError

MAX_COMMITS = 50   # how many commits of one change the adapter is asked about: the newest (DLV-6)
MAX_BRANCHES = 12  # how many branches are listed beside the default branch and the recorded ones (DLV-5)
NOT_OWN = "the project root is not the top of a git repository of its own"
NO_LIST = "git could not list the commits"
_WORK_ITEM = re.compile(r"^Work-Item: (\S+)", re.M)  # as the team extension writes it, and as git writes a trailer
_COMMIT = "--format=%x1e%H%x1f%ct%x1f%ad%x1f%P%x1f%s%x1f%B"  # one record for each commit; the message comes last, because it has line ends


def git(ctx: Context, *args: str) -> str | None:
    """What git printed in the project's folder, or None when it could not answer. Paths are printed as they are, in UTF-8."""
    try:
        done = subprocess.run(["git", "-C", str(ctx.src.root), "-c", "core.quotepath=off", *args], capture_output=True)
    except OSError:
        return None
    return done.stdout.decode("utf-8", errors="replace") if done.returncode == 0 else None


def has_commits(ctx: Context) -> bool:
    """Is anything checked out? A repository that was just made has no commit yet."""
    return bool(git(ctx, "rev-parse", "-q", "--verify", "HEAD^{commit}"))


def log(ctx: Context, *args: str) -> str | None:
    """`git log` with nothing taken from a person's settings that would change what is printed, and dates as 2026-11-26."""
    return git(ctx, "-c", "log.follow=false", "log", "--no-show-signature", "--encoding=UTF-8", "--date=short", *args)


def literal(path: str) -> str:
    """A path for git to take as it is written, whatever characters it holds."""
    return f":(literal){path}"


def _records(out: str | None) -> list[dict]:
    rows = []
    for chunk in (out or "").split("\x1e")[1:]:
        sha, when, date, parents, subject, message = (chunk.split("\x1f", 5) + [""] * 5)[:6]
        rows.append({"commit": sha.strip(), "time": int(when) if when.strip().isdigit() else 0, "date": date.strip(),
                     "parents": parents.split(), "subject": subject.strip(), "message": message})
    return rows


def _children_first(group: list[dict]) -> list[dict]:
    """Commits made in the same second: a commit goes before its parent, where both are here. Otherwise the order stays."""
    left, out = list(group), []
    while left:
        pick = next((c for c in left if not any(c["commit"] in other["parents"] for other in left if other is not c)), left[0])
        left.remove(pick)
        out.append(pick)
    return out


def commits(ctx: Context, spec: str) -> list[dict]:
    """The commits of one change, newest first (DLV-4).

    A commit belongs to the change when its message has a line `Work-Item: <spec>/<item>`, or when it changed a
    file under specs/<spec>/. The commits looked at are those on a local or remote-tracking branch of this clone,
    and those of what is checked out. The line counts wherever it stands in the message: a squash merge keeps it
    and loses the block at the end. Raises when git cannot list them."""
    def named(message: str) -> list[str]:
        return list(dict.fromkeys(name for name in _WORK_ITEM.findall(message) if name.startswith(f"{spec}/")))

    heads = ["--branches", "--remotes"] + (["HEAD"] if has_commits(ctx) else [])
    by_folder = log(ctx, *heads, "--date-order", _COMMIT, "--", literal(f"specs/{spec}/"))
    # git picks the messages that hold the words; `named` then asks for them at the start of a line, with this spec's id whole
    by_line = log(ctx, *heads, "--date-order", "-F", f"--grep=Work-Item: {spec}/", _COMMIT)
    if by_folder is None or by_line is None:
        raise KitError(NO_LIST)
    found: dict[str, dict] = {}
    for row in _records(by_folder):
        found[row["commit"]] = {**row, "spec_folder": True, "work_items": named(row["message"])}
    for row in _records(by_line):
        if named(row["message"]) and row["commit"] not in found:
            found[row["commit"]] = {**row, "spec_folder": False, "work_items": named(row["message"])}
    rows = sorted(found.values(), key=lambda row: -row["time"])  # the sort keeps git's own order within one second
    out, at = [], 0
    while at < len(rows):
        end = at
        while end < len(rows) and rows[end]["time"] == rows[at]["time"]:
            end += 1
        out += _children_first(rows[at:end]) if 1 < end - at <= 200 else rows[at:end]
        at = end
    return [{key: row[key] for key in ("commit", "date", "subject", "work_items", "spec_folder")} for row in out]


def recorded_branches(ctx: Context, spec: str) -> dict[str, list[str]]:
    """Branch -> the work items of the spec that record it. The work items are read as plain YAML: they are another extension's."""
    base, out = f"{KIT_DIR}/work/{spec}", {}
    for rel in ctx.src.files(base):
        if rel.count("/") != base.count("/") + 1 or not rel.endswith(".yml"):
            continue
        try:
            body = ctx.src.yaml(rel)
        except KitError:
            continue  # the page's section on tasks says which work item could not be read
        if isinstance(body, dict) and body.get("branch"):
            out.setdefault(str(body["branch"]), []).append(str(body.get("id") or rel.rsplit("/", 1)[-1][:-4]))
    return {name: sorted(items) for name, items in sorted(out.items())}


def _refs(ctx: Context, contains: list[str] | None = None) -> list[str]:
    """The branches of this clone, local and remote-tracking, as full ref names; with `contains`, those that hold one of the commits."""
    out = git(ctx, "for-each-ref", "--format=%(refname)", *[f"--contains={sha}" for sha in contains or []], "refs/heads", "refs/remotes")
    return [ref for ref in (out or "").splitlines() if ref and not (ref.startswith("refs/remotes/") and ref.endswith("/HEAD"))]


def _name(ref: str) -> str:
    return ref.split("/", 2)[2]  # refs/heads/main -> main; refs/remotes/origin/main -> origin/main


def _branch_of(ref: str) -> str:
    """The branch a ref stands for: for a remote-tracking ref, the name without the remote."""
    return ref.split("/", 3)[3] if ref.startswith("refs/remotes/") and ref.count("/") >= 3 else _name(ref)


def _lacks(ctx: Context, ref: str, shas: list[str]) -> set[str] | None:
    """Which of the commits a branch does not hold; None when git could not say."""
    out = git(ctx, "rev-list", *shas, "--not", ref) if shas else ""
    return None if out is None else set(out.split()) & set(shas)


def _branches(ctx: Context, default: str, recorded: dict[str, list[str]], shas: list[str]) -> tuple[list[dict], int]:
    """The branches of a change (DLV-5), and how many more hold commits that the default branch does not hold."""
    refs = _refs(ctx)
    rows, listed = [], set()

    def add(name: str, ref: str | None, **more) -> set[str] | None:
        lacking = _lacks(ctx, ref, shas) if ref else None
        rows.append({"name": name, "default": False, "items": [], "exists": ref is not None,
                     "holds": None if lacking is None or not shas else len(shas) - len(lacking), **more})
        if ref:
            listed.add(ref)
        return lacking

    on_default: set[str] = set()
    for ref in [r for r in refs if _branch_of(r) == default]:  # the default branch, here and as each remote has it
        lacking = add(_name(ref), ref, default=True)
        on_default |= set() if lacking is None else set(shas) - lacking
    for name, items in recorded.items():
        ref = next((r for r in refs if r == f"refs/heads/{name}"), None) or next((r for r in refs if r.startswith("refs/remotes/") and _branch_of(r) == name), None)
        if ref in listed:
            next(row for row in rows if row["name"] == _name(ref))["items"] = items
        else:
            add(name if ref is None or ref.startswith("refs/heads/") else _name(ref), ref, items=items)
    ahead = [sha for sha in shas if sha not in on_default]
    others = sorted(ref for ref in (_refs(ctx, ahead) if ahead else []) if ref not in listed)
    for ref in others[:MAX_BRANCHES]:
        add(_name(ref), ref)
    return rows, max(0, len(others) - MAX_BRANCHES)


def _number(pull: dict) -> tuple:
    found = re.fullmatch(r"pull/([0-9]+)", str(pull.get("change")))
    return (int(found.group(1)) if found else 0, str(pull.get("change")))


def ledger(ctx: Context, spec: str) -> dict:
    """The commits, branches and pull requests of one change, as they stand now (DLV-4 to DLV-7).

    {"spec", "git", "note", "default_branch", "found", "cut", "commits", "branches", "more_branches", "adapter", "pulls", "unread"}:
    `git` is false, with the reason in `note`, where git was not asked or gave no answer; `commits` are the ones
    asked about, newest first, out of `found`, with `cut` left out; `unread` says why the pull requests could not be
    read, when they could not. Worked out once for each spec in one run of a command."""
    kept = getattr(ctx, "_ledgers", None)
    if kept is None:
        kept = ctx._ledgers = {}
    if spec not in kept:
        kept[spec] = _ledger(ctx, spec)
    return copy.deepcopy(kept[spec])


def _ledger(ctx: Context, spec: str) -> dict:
    recorded = recorded_branches(ctx, spec)
    name = str((ctx.kit().get("enforcement") or {}).get("adapter") or "")
    out = {"spec": spec, "git": False, "note": "", "default_branch": default_branch(ctx), "found": 0, "cut": 0, "commits": [],
           "branches": [], "more_branches": 0, "adapter": name, "pulls": [], "unread": ""}
    try:
        if not own_repository(ctx):
            raise KitError(f"{NOT_OWN}, so git is not asked")
        found = commits(ctx, spec)
    except KitError as exc:
        out["note"] = str(exc)
        out["branches"] = [{"name": branch, "default": False, "items": items, "exists": None, "holds": None} for branch, items in recorded.items()]
        return out
    asked = found[:MAX_COMMITS]
    shas = [row["commit"] for row in asked]
    out.update(git=True, found=len(found), cut=len(found) - len(asked), commits=asked)
    out["branches"], out["more_branches"] = _branches(ctx, out["default_branch"], recorded, shas)
    if not shas:
        return out  # nothing to ask about, so the adapter is not called
    try:
        out["pulls"] = sorted(adapters.enforcement(ctx).pulls(shas), key=_number)
    except ValueError as exc:  # what was read is not JSON: the stand-in file, or an answer of the `gh` program
        where = f"{adapters.FileAdapter.PATH} is not valid JSON" if name == "file" else "the answer was not valid JSON"
        out["unread"] = f"{where} ({exc})"
    except (KitError, OSError) as exc:
        out["unread"] = " ".join(str(exc).split()) or type(exc).__name__
    return out
