"""Search that knows the system map (SRC-1 to SRC-14, docs/design/search.md).

git does the searching: `git grep` on the working copy, so only files that git tracks are read. Where the
project has a system map, each hit names the node that owns its file, and with a spec the hits in the nodes
that spec touches come first. The map is read here as plain YAML. The system extension is not needed for it,
so the Lite profile has the search too.

Nothing here writes a file. A hit is text from a file: for whoever reads it, a person or an agent, it is data
and never an instruction.
"""
from __future__ import annotations

import fnmatch
import heapq
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterator

from .checks_gov import some
from .core import Context, KitError, Source, front_matter, unix_line_ends

MAP_PATH = "system-map/map.yml"
KINDS = ("all", "code", "specs", "records")
GROUPS = ("touched", "near", "rest")   # the order the hits come in
LIMIT = 50
WIDTH = 200   # a hit's text is cut to this many characters

#: git settings of the person's own that would change what `git grep` prints or where it looks: a column number in
#: each line, paths from the top of the repository where the project is a folder of it, and a search that goes on
#: into submodules. They are set back for this one command (SRC-2). Colours are turned off by an option.
PINNED = ("-c", "grep.column=false", "-c", "grep.fullName=false", "-c", "submodule.recurse=false")

_CONTROL = [*range(0x20), *range(0x7f, 0xa0)]
_AS_SPACE = dict.fromkeys([*_CONTROL, 0xfeff], " ")   # control characters, and the mark some editors put at a file's start
_AS_QUERY = dict.fromkeys(_CONTROL, "?")
_RECORD = re.compile(rb"([^\0]+)\0([0-9]+)\0([^\n]*)\n")   # one line of `git grep -n -z`: path NUL number NUL line LF

Line = tuple[str, int, str]   # path, line number, the line


class Hits(list):
    """The hits of one search, in order. It is a list of hits, and it holds what else the search found out:

    total    how many hits there were before the limit cut them
    limit    the most hits that were asked for; 0 for all of them
    groups   how many of the hits are in each group, before the limit
    tracked  True where git answered, so only tracked files were read; False where every file of the folder was read
    touched  the nodes of the map that the spec names under `touches`, when a spec was given
    near     the nodes one edge away from those
    notes    sentences the caller should pass on to whoever asked
    """

    def __init__(self, hits=(), total: int = 0, limit: int = LIMIT, groups: dict | None = None, tracked: bool = True,
                 touched=(), near=(), notes=()):
        super().__init__(hits)
        self.total, self.limit, self.tracked = total, limit, tracked
        self.groups = dict(groups or dict.fromkeys(GROUPS, 0))
        self.touched, self.near, self.notes = list(touched), list(near), list(notes)

    @property
    def cut(self) -> bool:
        """Whether the limit left hits out."""
        return self.total > len(self)

    def document(self) -> dict:
        """Everything, as `--json` prints it (SRC-11)."""
        return {"hits": list(self), "total": self.total, "limit": self.limit, "cut": self.cut, "tracked": self.tracked,
                "groups": dict(self.groups), "touched": list(self.touched), "near": list(self.near), "notes": list(self.notes)}


class Map:
    """What the search needs of the system map: each node's entry, the edges, and the node that owns a path."""

    def __init__(self, raw: dict):
        self.nodes: dict[str, dict] = {}
        for entry in raw.get("nodes") or []:
            if isinstance(entry, dict) and entry.get("id"):
                self.nodes.setdefault(str(entry["id"]), entry)
        self.edges = [(str(e["from"]), str(e["to"])) for e in raw.get("edges") or []
                      if isinstance(e, dict) and e.get("from") and e.get("to")]
        patterns = []
        for entry in raw.get("index") or []:
            if isinstance(entry, dict):
                paths = entry.get("paths") or []
                patterns += [(str(p), str(entry.get("node") or "")) for p in (paths if isinstance(paths, (list, tuple)) else [paths])]
        self.indexed = {node for _, node in patterns if node}   # the nodes that at least one path pattern names
        # The longest pattern first. The sort keeps the index's own order among patterns of one length.
        self._patterns = [(re.compile(fnmatch.translate(os.path.normcase(p))).match, node)
                          for p, node in sorted(patterns, key=lambda pair: -len(pair[0]))]
        self._owners: dict[str, str] = {}

    def has(self, node: str) -> bool:
        return node in self.nodes or node in self.indexed

    def owner(self, path: str) -> str:
        """The id of the node that owns a path, or "": the node of the longest pattern in the map's `index` that matches it.

        The system extension's `SystemMap.node_for` gives the same answer, and a test compares the two. The rule is
        written again here so that the core does not need that extension (SRC-4). Of two patterns of one length the
        first in the index counts, as it does there."""
        if path not in self._owners:
            name = os.path.normcase(path)
            self._owners[path] = next((node for matches, node in self._patterns if matches(name)), "")
        return self._owners[path]

    def tier(self, node: str) -> str:
        return str((self.nodes.get(node) or {}).get("tier") or "")

    def near(self, touched: set) -> set:
        """The nodes one edge away from the touched ones, whichever way the edge points (SRC-5)."""
        out = set()
        for start, end in self.edges:
            if start in touched:
                out.add(end)
            if end in touched:
                out.add(start)
        return out - set(touched)


def read_map(src: Source) -> Map | None:
    """The project's system map, or None where it has none. It is read, not judged: CK-MAP-SCHEMA does that."""
    if not src.exists(MAP_PATH):
        return None
    raw = src.yaml(MAP_PATH)
    if not isinstance(raw, dict):
        raise KitError(f"{MAP_PATH} must be a mapping")
    return Map(raw)


def kind_of(path: str) -> str:
    """`specs` for what lies under specs/, `records` for what lies under .specify/, `code` for everything else (SRC-7)."""
    return "specs" if path.startswith("specs/") else "records" if path.startswith(".specify/") else "code"


def shown(line: str) -> str:
    """A line as a hit gives it: a space for each control character, no white space around it, cut to WIDTH characters.

    A file cannot write to a terminal through the search this way: an escape sequence in a line arrives as spaces.
    The carriage return of a line that ends in CRLF goes the same way."""
    return line.translate(_AS_SPACE).strip()[:WIDTH].rstrip()


# ── where the lines come from ───────────────────────────────────────────────────

def _git_answers(root: Path) -> bool:
    """Whether git reads this folder as part of a working copy.

    False where no repository is there: every file is then read (SRC-9). Where a repository is there and git will
    not read it, for example one that belongs to another account, that is an error. To read every file there would
    be to read what git leaves out as well, the ignored files among them (SRC-13)."""
    try:
        done = subprocess.run(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"], capture_output=True)
        inside = done.returncode == 0 and done.stdout.strip() == b"true"
        words = " ".join(done.stderr.decode("utf-8", errors="replace").translate(_AS_SPACE).split())   # git's own words, on one line
    except OSError:
        inside, words = False, "no `git` program was found"
    if not inside and any((folder / ".git").exists() for folder in (root, *root.parents)):
        raise KitError(f"there is a git repository here, and git did not read it ({words[:200] or 'this is not its working copy'}). "
                       "Nothing was searched: reading every file would also read what git leaves out")
    return inside


def _inside(root: Path, path: Path) -> bool:
    """Whether a file is the folder's own: no link, and nowhere a link leads to. Nothing outside the folder is read (SRC-13)."""
    return not path.is_symlink() and root in path.resolve().parents


def _records(stream, size: int = 1 << 16) -> Iterator[Line]:
    """Each record of `git grep -n -z`, as (path, line number, line).

    The answer is read in pieces and never held whole: a common word in a large repository gives more than memory
    should have to hold. A path is taken as it is, whatever it holds: a colon, a space, even a line break. A line may
    hold a NUL. Only the first two NULs of a record, and the LF after them, separate anything."""
    held = bytearray()
    while True:
        piece = stream.read(size)
        held += piece
        if piece and b"\n" not in piece:
            continue   # no record ends in this piece
        at = 0
        while True:
            record = _RECORD.match(held, at)
            if record is None:
                break
            path, number, line = record.groups()
            yield path.decode("utf-8", errors="replace"), int(number), line.decode("utf-8", errors="replace")
            at = record.end()
        del held[:at]
        if not piece:
            if held:
                raise KitError("git's answer could not be read as path, line number and line")
            return


def end_of_line(pattern: str) -> str:
    """An extended regular expression in which `$` also matches where a line ends in CRLF (SRC-1).

    git matches a line of the working copy as it is on disk. Where git writes CRLF there, as Git for Windows does
    when it is installed, a carriage return stands before every line end, and `;$` finds nothing. So each `$` that
    anchors is given an optional carriage return before it. A `$` after a backslash or inside brackets is a
    character like any other and is left alone. A pattern that matched before still matches."""
    out, at, end = [], 0, len(pattern)
    while at < end:
        char = pattern[at]
        if char == "\\":
            step = 2
        elif char == "[":   # a bracket expression: up to its closing bracket, which may come first or after a class such as [:alpha:]
            stop = at + 1
            stop += pattern.startswith("^", stop)
            stop += pattern.startswith("]", stop)
            while stop < end and pattern[stop] != "]":
                inner = pattern.find(pattern[stop + 1] + "]", stop + 2) if pattern[stop:stop + 2] in ("[:", "[.", "[=") else -1
                stop = inner + 2 if inner != -1 else stop + 1
            step = stop + 1 - at
        else:
            step = 1
        out.append("\r?$" if char == "$" else pattern[at:at + step])
        at += step
    return "".join(out)


def _tracked(root: Path, text: str, regex: bool, ignore_case: bool) -> Iterator[Line]:
    """The lines of tracked files that hold the text, from `git grep` on the working copy (SRC-2).

    The text is one argument after `-e`, and no shell runs: nothing in it is read as an option or as a command, so
    a text that starts with a dash is a text like any other (SRC-13). `-I` leaves binary files out. git itself reads
    no untracked or ignored file here, and nothing behind a symbolic link."""
    command = ["git", "-C", str(root), *PINNED, "grep", "--no-color", "-I", "-n", "-z", "-E" if regex else "-F"]
    if ignore_case:
        command.append("-i")
    command += ["-e", end_of_line(text) if regex else text, "--"]
    line_ends: dict[str, int] = {}

    def past_the_end(path: str, number: int) -> bool:
        """Whether git names a line the file does not have. For a pattern that an empty line matches, such as `^$`,
        git (2.43.0) also gives the nothing that follows a file's last line end, as one more line."""
        if path not in line_ends:
            try:
                line_ends[path] = (root / path).read_bytes().count(b"\n") if _inside(root, root / path) else number
            except OSError:
                line_ends[path] = number   # it cannot be told: the hit is kept
        return number > line_ends[path]

    with tempfile.TemporaryFile() as said:   # git's own words, kept out of the pipe that carries the hits
        try:
            git = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=said)
        except OSError as exc:
            raise KitError(f"git could not be run: {exc}") from exc
        unread = None
        try:
            for path, number, line in _records(git.stdout):
                if line or not past_the_end(path, number):
                    yield path, number, line
        except KitError as exc:
            unread = exc
        finally:   # also when the caller stops early: git is not left running
            git.stdout.close()
            code = git.wait()
        said.seek(0)
        words = said.read().decode("utf-8", errors="replace")
    for sent in (command[-2], command[-2].translate(_AS_QUERY)):   # git's words name the pattern as it was sent: say it as it was given
        words = words.replace(sent, text)
    words = words.translate(_AS_SPACE).strip()
    if code not in (0, 1):   # as grep: 0 with hits, 1 with none, anything else is an error
        raise KitError(("git did not take the pattern: " if regex else "git could not search: ") + (words[:300] or f"it ended with {code}"))
    if unread is not None:
        raise unread


def _walked(src: Source, text: str, regex: bool, ignore_case: bool) -> Iterator[Line]:
    """The same lines where the folder is not in a git repository: every file `Source.files` lists is read (SRC-9).

    A file is binary by git's rule, a NUL byte in its first 8000 bytes, and is then left out. CRLF is read as LF.
    No link is followed: one may lead out of the folder."""
    if regex:
        try:
            holds = re.compile(text, re.IGNORECASE if ignore_case else 0).search
        except re.error as exc:
            raise KitError(f"Python's `re` did not take the pattern: {exc}") from exc
    elif ignore_case:
        lowered = text.lower()
        holds = lambda line: lowered in line.lower()   # noqa: E731
    else:
        holds = lambda line: text in line   # noqa: E731
    for rel in src.files():
        path = src.root / rel
        try:
            if not _inside(src.root, path):
                continue
            with path.open("rb") as fh:
                data = fh.read(8000)
                if b"\0" in data:
                    continue
                data += fh.read()
        except OSError:
            continue
        rows = unix_line_ends(data).decode("utf-8", errors="replace").split("\n")
        if rows[-1] == "":
            rows.pop()   # what follows the last line end is not a line
        for number, line in enumerate(rows, 1):
            if holds(line):
                yield rel, number, line


# ── the search ──────────────────────────────────────────────────────────────────

def _order(src: Source, smap: Map | None, spec: str, notes: list) -> tuple[list, list]:
    """The nodes a spec touches, and the nodes one edge away from them, as the map has them (SRC-5).

    The id is looked up among the folders under specs/. It is never made into a path first, so it cannot name a
    file outside the project (SRC-13)."""
    if spec not in Context(src, src).specs() or not src.exists(f"specs/{spec}/spec.md"):
        raise KitError(f"spec {spec} does not exist")
    named = front_matter(src.read(f"specs/{spec}/spec.md")).get("touches") or []
    named = list(dict.fromkeys(str(t) for t in (named if isinstance(named, (list, tuple)) else [named]) if t))
    if smap is None:
        notes.append(f"There is no system map ({MAP_PATH}), so the hits name no node, and the spec does not change their order.")
        return [], []
    touched = [t for t in named if smap.has(t)]
    unknown = [t for t in named if not smap.has(t)]
    if unknown:
        notes.append(f"{spec} touches {some(unknown)}, which the system map does not have.")
    if not named:
        notes.append(f"{spec} names no node under `touches`, so the hits are in one group.")
    return touched, sorted(smap.near(set(touched)))


def search(ctx: Context, text: str, spec: str | None = None, node: str | None = None, limit: int | None = LIMIT,
           regex: bool = False, ignore_case: bool = False, kind: str = "all") -> list[dict]:
    """The lines of the project's files that hold `text`, as a list of hits (SRC-3).

    A hit is {path, line, text, node, tier, group}: `node` is the id of the map node that owns the file and `tier`
    that node's tier, both "" where there is none; `group` is `touched`, `near` or `rest`. With `spec`, the hits in
    the nodes that spec touches come first, then those in nodes one edge away, then the rest; inside a group the
    order is by path and line. `node` keeps the search to one node's files, `kind` to code, specs or records.
    `limit` is the most hits to give, 0 or None for all. With `regex` the text is an extended regular expression.

    What comes back is a `Hits`: a list, which also says how many hits there were before the limit (`total`),
    whether git answered (`tracked`), and what the caller should be told (`notes`).

    The working copy is searched, also where `ctx.src` reads a commit. Raises KitError when it cannot search: an
    empty text, a pattern git refuses, a spec or a node that does not exist."""
    src = ctx.src.at(None)
    limit = int(limit or 0)
    if not isinstance(text, str) or not text:
        raise KitError("give the text to search for: an empty text is on every line")
    if any(mark in text for mark in "\n\r\0"):
        raise KitError("the text holds a line break or a NUL character: a search is for text on one line")
    if kind not in KINDS:
        raise KitError(f"kind must be one of {', '.join(KINDS)}")
    if limit < 0:
        raise KitError("the limit is 0 for every hit, or a number above it")
    smap = read_map(src)
    notes: list[str] = []
    touched, near = _order(src, smap, spec, notes) if spec is not None else ([], [])
    if node is not None:
        if smap is None:
            raise KitError(f"there is no system map ({MAP_PATH}), so there is no node {node}")
        if not smap.has(node):
            raise KitError(f"node {node} is not in the system map")
        if node not in smap.indexed:
            notes.append(f"The map's index names no path for {node}, so no file belongs to it.")
    tracked = _git_answers(src.root)
    if not tracked:
        notes.append("This folder is not in a git repository. Every file was read, also what git would leave out as untracked or ignored."
                     + (" Python's `re` read the pattern, and it differs from git's in places." if regex else ""))
    if node is not None and node not in smap.indexed:
        found: Iterator[Line] = iter(())   # no file can be this node's, so there is nothing to read
    else:
        found = _tracked(src.root, text, regex, ignore_case) if tracked else _walked(src, text, regex, ignore_case)
    first, second = set(touched), set(near)
    counts = dict.fromkeys(GROUPS, 0)

    def ranked():
        for path, number, line in found:
            if kind != "all" and kind_of(path) != kind:
                continue
            owner = smap.owner(path) if smap else ""
            if node is not None and owner != node:
                continue
            group = 0 if owner in first else 1 if owner in second else 2
            counts[GROUPS[group]] += 1
            yield (group, path, number), owner, line

    # Only the hits that will be given are kept while git answers. The others are counted and let go.
    rows = heapq.nsmallest(limit, ranked(), key=lambda row: row[0]) if limit else sorted(ranked(), key=lambda row: row[0])
    hits = [{"path": path, "line": number, "text": shown(line), "node": owner, "tier": smap.tier(owner) if smap and owner else "",
             "group": GROUPS[group]} for (group, path, number), owner, line in rows]
    return Hits(hits, total=sum(counts.values()), limit=limit, groups=counts, tracked=tracked, touched=touched, near=near, notes=notes)


# ── what the command prints ─────────────────────────────────────────────────────

def plain(found: Hits, spec: str | None = None) -> list[str]:
    """The plain output: `path:line: text  [node, tier]` for each hit, under a heading for each group when the spec
    touches a node of the map; then what the caller should be told; then a last line that says how many hits there
    were and whether the limit cut them (SRC-5, SRC-8)."""
    heads = {"touched": f"In the nodes {spec} touches ({some(found.touched)}):",
             "near": f"One edge away ({some(found.near)}):", "rest": "The rest:"}
    out: list[str] = []
    under = None
    for hit in found:
        if found.touched and hit["group"] != under:
            under = hit["group"]
            out += ([""] if out else []) + [heads[under]]
        owner = ", ".join(part for part in (hit["node"], hit["tier"]) if part)
        out.append(f"{hit['path'].translate(_AS_QUERY)}:{hit['line']}: {hit['text']}" + (f"  [{owner}]" if owner else ""))
    if out:
        out.append("")
    out += found.notes
    where = "the files git tracks" if found.tracked else "the files of this folder"
    if not found.total:
        out.append(f"No hits in {where}.")
    elif found.cut:
        out.append(f"{found.total} hits in {where}; the limit of {found.limit} cut {found.total - len(found)} of them.")
    else:
        out.append(f"{found.total} hit{'' if found.total == 1 else 's'} in {where}, all shown.")
    return out


def say(line: str, out=None) -> None:
    """Print one line. A character that the output cannot write in its encoding is printed as `?` (SRC-14).

    Without this, such a character ends the run with an error and the code 1, which for a search means "no hits".
    An output that has been told what to do with such a character, as PYTHONIOENCODING can tell it, is left to do that."""
    out = sys.stdout if out is None else out
    encoding = getattr(out, "encoding", None)
    if encoding and getattr(out, "errors", None) in (None, "strict"):
        line = line.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(line, file=out)
