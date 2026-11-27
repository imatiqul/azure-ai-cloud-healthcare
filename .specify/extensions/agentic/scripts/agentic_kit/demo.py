"""One gate, shown to someone who has just met the kit (DEMO-1 to DEMO-9, docs/design/demo.md).

The demo writes a small project into a temporary folder, runs the kit's own commands there and prints
what they print. A file in that project plays GitHub: the file adapter. That proves nothing about who
approved, and the demo says so at the start and at the end.

It decides nothing itself. After each step it looks at what the kit printed and compares it with what
the demo says the kit does; when the two differ it names the step and ends with 1.
"""
from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

import yaml

from .core import KIT_DIR, KitError
from .selftest import ROLE_IDS

SPEC = "001-greeting"
GATE = "G1"
AGENT = "demo-agent"   # the account the agent works under; the file adapter is told so
PERSON = "pat"         # listed in roles.yml
ROLE = "product-owner"
CHANGE = "pull/1"
ADAPTER = f"{KIT_DIR}/_adapter/reviews.json"
SPEC_FILE = f"specs/{SPEC}/spec.md"
APPROVAL_CHECKS = ["CK-APPROVER", "CK-GATE-MIRROR", "CK-GATE-RECORD"]

STAND_IN = ("A file in that folder plays GitHub. It is a stand-in: it proves nothing about who approved.\n"
            "On a real project the review is a pull-request review on GitHub, by a person who is signed in.")

SPEC_MD = f"""---
spec: {SPEC}
tier_declared: low
owner_role: {ROLE}
paths: ["src/greeting/*"]
---
# Feature Specification: A greeting that uses the person's name

## Requirements
- **FR-001**: The command MUST print a greeting that contains the name it was given.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the name "Ada", When the command runs, Then it prints "Hello, Ada."
"""

Call = Callable[[list], tuple]  # a kit command line, as words -> (exit code, what it printed)


class NotAsWritten(Exception):
    """The kit did not do what the demo says it does."""


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def build_project(root: Path) -> None:
    """A Lite project with one spec that waits at G1, and the file adapter in place of GitHub (DEMO-8)."""
    _write(root, ".specify/init-options.json", json.dumps({"speckit_version": "1.4.3"}) + "\n")
    _write(root, ".github/CODEOWNERS", f"/.specify/ @{PERSON}\n")
    _write(root, f"{KIT_DIR}/kit.yml", yaml.safe_dump({
        "schema": "agentic-kit/1", "profile": "lite", "domain_packs": [],
        "enforcement": {"adapter": "file", "default_branch": "main"}, "upstream": {"speckit": "1.4.3"},
        "gates": {"single_approver_exception": "forbidden", "require_evidence_hash": True}}, sort_keys=False))
    _write(root, f"{KIT_DIR}/roles.yml", yaml.safe_dump({
        "schema": "agentic-roles/1",
        "people": [{"id": PERSON, "roles": [ROLE, "solutions-architect"]}, {"id": "sam", "roles": ["qa"]}],
        "roles": {r: {"title": r} for r in ROLE_IDS}}, sort_keys=False))
    _write(root, SPEC_FILE, SPEC_MD)
    _reviews(root, [])


def _reviews(root: Path, reviews: list) -> None:
    """What the stand-in holds: who the agent is, who wrote the change, and the reviews on it."""
    _write(root, ADAPTER, json.dumps({"agent_identity": AGENT, "ci_identity": "demo-ci",
                                      "changes": {CHANGE: {"authors": [AGENT], "reviews": reviews}}}, indent=2) + "\n")


def _review(number: int, reviewer: str, commit: str, line: str) -> dict:
    return {"id": str(number), "reviewer": reviewer, "type": "User", "state": "APPROVED", "commit": commit,
            "body": f"Read it. Approved.\n{line}\n"}


def _git(root: Path, *args: str) -> str:
    """git in the demo's folder, under a name of its own and with nothing taken from the person's settings that could stop it."""
    command = ["git", "-C", str(root), "-c", "user.name=demo", "-c", "user.email=demo@example.invalid",
               "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", *args]
    try:
        done = subprocess.run(command, capture_output=True, text=True)
    except FileNotFoundError:
        raise KitError("the demo needs git, and no `git` program was found") from None
    if done.returncode:
        raise KitError(f"git {args[0]} failed in the demo's folder: {done.stderr.strip()[:200]}")
    return done.stdout.strip()


def _commit(root: Path, message: str) -> str:
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", message)
    return _git(root, "rev-parse", "HEAD")


def _remove(folder: Path) -> None:
    """Delete the demo's folder. git marks its object files read-only, which stops a plain delete on Windows."""
    def again(function, path, _error):
        os.chmod(path, stat.S_IWRITE)
        function(path)
    if sys.version_info >= (3, 12):
        shutil.rmtree(folder, onexc=again)
    else:
        shutil.rmtree(folder, onerror=again)


def board_cell(board: str, gate: str = GATE) -> str:
    """What the gate board says for one gate of the demo's spec, or '' when the board has no such row."""
    rows = [[cell.strip() for cell in line.strip().strip("|").split("|")] for line in board.splitlines() if line.startswith("|")]
    header = next((r for r in rows if r and r[0] == "Spec"), None)
    row = next((r for r in rows if r and r[0] == SPEC), None)
    if not header or not row or gate not in header:
        return ""
    return row[header.index(gate)]


class Demo:
    def __init__(self, root: Path, call: Call, out: Callable[[str], None]):
        self.root, self.call, self.out = root, call, out
        self.step = ""

    # -- what is shown ------------------------------------------------------------------------------------

    def say(self, text: str = "") -> None:
        for line in text.splitlines() or [""]:
            self.out(f"  {line}" if line else "")

    def title(self, text: str) -> None:
        self.step = text
        self.out("")
        self.out(text)

    def kit(self, *words: str) -> tuple:
        """Run one kit command in the demo's folder, and show the command and what it printed (DEMO-3)."""
        self.out(f"$ agentic.py {' '.join(words)}")
        code, text = self.call(["--root", str(self.root), *words])
        for line in text.rstrip("\n").splitlines():
            self.out(f"    {line}" if line else "")
        return code, text

    def expect(self, holds: bool, what: str) -> None:
        if not holds:
            raise NotAsWritten(f'{self.step}: {what}')

    # -- the steps ----------------------------------------------------------------------------------------

    def run(self) -> None:
        self.title("1. Where the change stands")
        self.say("One spec has been written. Nobody has decided anything about it yet.")
        _, board = self.kit("report", "gates")
        self.expect(board_cell(board) == "open", f"the gate board does not show {GATE} as open")
        self.say("The agent writes the page a reviewer reads, and commits it with the spec:\n"
                 "a reviewer sees only what is committed and pushed.")
        code, _ = self.kit("brief", "--spec", SPEC, "--gate", GATE, "--write")
        self.expect(code == 0, "the brief was not written")
        commit = _commit(self.root, "The spec, and the reviewer's page for G1")
        short = commit[:12]
        self.say(f"Committed as {short}. This is what {GATE} needs, and the line that approves it:")
        code, text = self.kit("gate", "--spec", SPEC, "--gate", GATE)
        line = next((row.strip() for row in text.splitlines() if row.strip().startswith(f"gate {GATE} approve sha256:")), "")
        self.expect(code == 0 and bool(line), "the gate command did not print the line to paste")
        self.say("The long value is a hash of the evidence: the spec and the reviewer's page, as they are now.")

        self.title("2. An agent says it approved")
        _reviews(self.root, [_review(1, AGENT, commit, line)])
        self.say(f"The stand-in now holds an approving review by `{AGENT}`, the account the agent itself works under.\n"
                 "The agent mirrors it into a decision record. Writing a record approves nothing:")
        code, _ = self.kit("record", "--spec", SPEC, "--gate", GATE, "--decision", "approve", "--commit", short,
                           "--approval", f"{AGENT}:{ROLE}:{CHANGE}#review-1")
        self.expect(code == 0, "the record command did not write the record")
        self.say("The check that reads the review itself is the judge:")
        code, text = self.kit("check", "CK-APPROVER")
        self.expect(code == 1 and "FAIL" in text and "own identity" in text,
                    "CK-APPROVER did not fail for a review by the agent's own account")
        _, board = self.call(["--root", str(self.root), "report", "gates"])  # not shown: only so that the next sentence stays true
        self.expect(board_cell(board) == "approved",
                    "the gate board no longer lists a recorded decision as approved, so the demo's sentence about it is out of date")
        self.say("In a pipeline this failure is what stops the pull request.\n"
                 "The gate board would still list this decision as approved: it shows what is recorded, and the checks judge it.")

        self.title("3. A named person approves")
        _reviews(self.root, [_review(1, AGENT, commit, line), _review(2, PERSON, commit, line)])
        self.say(f"The stand-in now also holds an approving review by `{PERSON}`, whom roles.yml lists as {ROLE}.\n"
                 "Its text carries the line from step 1, on a line of its own. The record is written again for that review:")
        code, _ = self.kit("record", "--spec", SPEC, "--gate", GATE, "--decision", "approve", "--commit", short,
                           "--approval", f"{PERSON}:{ROLE}:{CHANGE}#review-2")
        self.expect(code == 0, "the record command did not write the record")
        code, text = self.kit("check", *APPROVAL_CHECKS)
        self.expect(code == 0 and all(f"ok       {check}" in text for check in APPROVAL_CHECKS),
                    "the three approval checks did not all pass for a review by a listed person")
        _, board = self.kit("report", "gates")
        self.expect(board_cell(board) == "approved", f"the gate board does not show {GATE} as approved")
        self.say(f"{GATE} is approved. The next gate, G3, has nothing to review yet: there is no plan.")

        self.title("4. The spec changes after the approval")
        spec = self.root / SPEC_FILE
        before = spec.read_text(encoding="utf-8")
        after = before.replace('"Hello, Ada."', '"Good day, Ada."')
        self.expect(after != before, "the demo's spec does not hold the sentence the demo edits")
        spec.write_text(after, encoding="utf-8", newline="\n")
        self.say(f"One sentence of {SPEC_FILE} was edited. Nobody has reviewed the new wording:")
        _, text = self.kit("gate", "--spec", SPEC, "--gate", GATE)
        self.expect("approve recorded for DIFFERENT evidence" in text, "the gate command did not notice that the evidence changed")
        _, board = self.kit("report", "gates")
        self.expect(board_cell(board) == "open", f"the gate board does not show {GATE} as open again")
        self.say(f"{GATE} is open again. The approval was for the spec as it was, and it does not carry over.")


def run(call: Call, keep: bool = False, out: Callable[[str], None] = print) -> int:
    """The whole demo. `call` runs one kit command line and gives back its exit code and what it printed."""
    folder = Path(tempfile.mkdtemp(prefix="agentic-demo-"))
    try:
        build_project(folder)
        _git(folder, "init", "-q")
        _git(folder, "symbolic-ref", "HEAD", "refs/heads/main")
        out("agentic-spec-kit demo: one gate closes, and opens again")
        out("")
        out(f"  Everything below happens in a new, throwaway project: {folder}")
        out("  Nothing is read from the folder you are in, and nothing is written to it.")
        for line in STAND_IN.splitlines():
            out(f"  {line}")
        try:
            Demo(folder, call, out).run()
        except NotAsWritten as wrong:
            out("")
            out(f"The demo did not go as written. {wrong}.")
            out("What the kit printed is above. Please report it: the demo and the kit disagree, and one of them is wrong.")
            return 1
        out("")
        out("What you saw")
        out("  - An approval by the agent's own account did not pass.")
        out("  - An approval by a listed person did, for the evidence as it stood.")
        out("  - A change to that evidence opened the gate again.")
        out("What you did not see")
        out("  - GitHub. A file played it, and anyone who can write the repository can write that file:")
        out("    it proves nothing about who approved. `doctor` says so wherever that adapter is configured.")
        out("  - A pull request, a review by a signed-in person, or a pipeline. Those are what make an approval count.")
        return 0
    finally:
        if keep:
            out("")
            out(f"The project is kept at {folder}")
        else:
            _remove(folder)
            out("")
            out("The throwaway project has been deleted. Run the demo with --keep to look inside one.")
