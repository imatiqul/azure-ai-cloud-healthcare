"""Bindings to things outside the neutral rules: the enforcement channel and suppression patterns.

Enforcement adapter interface (GOV-6 to GOV-8, ADP-3):
    agent_identity() -> str | None     account the agent's own credential belongs to
    ci_identity() -> str | None        account CI runs as
    reviews(change) -> list[Review]    reviews on a change, e.g. change = "pull/12"
    authors(change) -> set[str]        accounts that authored the commits in the change
    setup_report() -> list[dict]       [{"item", "status": pass|fail|not-checkable, "detail"}]
    pulls(commits) -> list[dict]       pull requests that hold one of the commits (DLV-1): [{"change": "pull/<n>",
                                       "state": open|closed|merged, "head", "base", "merge_commit": sha or "", "url"}]
    commit_at(repo, ref) -> str        the full id of a commit of a repository, named as owner/name; raises where the
                                       repository or the commit cannot be read (PRG-11)
    file_at(repo, ref, path) -> str | None             the text of a file at that commit; None where it holds no such file
    folder_at(repo, ref, path) -> dict[str, str] | None   name -> the id git has for it, for what a folder holds at that
                                       commit; None where it holds no such folder. An empty ref is the default branch's head
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass

from .core import KIT_DIR, Context, KitError, Source


@dataclass
class Review:
    id: str
    reviewer: str
    account_type: str  # "User" for a human account; anything else never counts
    state: str  # APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
    commit: str
    body: str

    @property
    def ref_suffix(self) -> str:
        return f"review-{self.id}"


PULL_STATES = ("open", "closed", "merged")  # what `pulls` says of a pull request (DLV-1)


REPO_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+")  # another repository, as owner/name (PRG-8)
COMMIT_ID = re.compile(r"[0-9a-f]{7,40}")


def same_commit(a: str, b: str) -> bool:
    """Do two commit ids name one commit? One of them may be cut short, to seven characters or more."""
    return min(len(a), len(b)) >= 7 and (a.startswith(b) or b.startswith(a))


class FileAdapter:
    """Reads reviews from a JSON file in the repo. For self-tests and offline demos only.

    It proves nothing about who approved: anyone who can write the repo can write the file.
    `doctor` reports that when this adapter is configured.
    """

    name = "file"
    PATH = f"{KIT_DIR}/_adapter/reviews.json"

    def __init__(self, src: Source):
        self.data = json.loads(src.read(self.PATH)) if src.exists(self.PATH) else {}

    def agent_identity(self):
        return self.data.get("agent_identity")

    def ci_identity(self):
        return self.data.get("ci_identity")

    def _change(self, change: str) -> dict:
        return (self.data.get("changes") or {}).get(change) or {}

    def reviews(self, change: str) -> list[Review]:
        return [Review(str(r["id"]), r["reviewer"], r.get("type", "User"), r.get("state", ""), r.get("commit", ""),
                       r.get("body", "")) for r in self._change(change).get("reviews", [])]

    def authors(self, change: str) -> set[str]:
        return {a.lower() for a in self._change(change).get("authors", [])}

    def pulls(self, commits: list[str]) -> list[dict]:
        """The pull requests the stand-in says hold one of these commits (DLV-3). It proves nothing about what GitHub holds.

        An entry holds a commit that it lists under `commits`, names as its `merge_commit`, or carries a review on."""
        out = []
        for change, body in (self.data.get("changes") or {}).items():
            body = body if isinstance(body, dict) else {}
            merge = str(body.get("merge_commit") or "")
            state = str(body.get("state") or ("merged" if merge else "open"))
            if state not in PULL_STATES:
                raise KitError(f"{self.PATH}: the state of {change} is {state!r}; it is one of {', '.join(PULL_STATES)}")
            merge = merge if state == "merged" else ""  # before a merge, what GitHub names is a test merge: no commit of the pull request
            held = [str(c) for c in body.get("commits") or []] + [merge] + [str(r.get("commit") or "") for r in body.get("reviews") or [] if isinstance(r, dict)]
            if any(same_commit(c, h) for c in commits for h in held):
                out.append({"change": str(change), "state": state, "head": str(body.get("head") or ""), "base": str(body.get("base") or ""),
                            "merge_commit": merge, "url": str(body.get("url") or "")})
        return out

    def _commit(self, repo: str, ref: str) -> tuple[str, dict[str, str]]:
        """(the full id, path -> text) for what the stand-in says a commit of another repository holds (PRG-11).
        An empty ref is the commit named as `default`. It proves nothing about what GitHub holds."""
        body = (self.data.get("repositories") or {}).get(repo)
        if not isinstance(body, dict):
            raise KitError(f"{self.PATH} holds no repository {repo}")
        commits = body.get("commits") if isinstance(body.get("commits"), dict) else {}
        wanted = str(ref or body.get("default") or "")
        for sha, files in commits.items():
            if same_commit(str(sha), wanted):
                return str(sha), {str(path): str(text) for path, text in (files if isinstance(files, dict) else {}).items()}
        raise KitError(f"{self.PATH} holds no commit {wanted or '(no default is named)'} of {repo}")

    def commit_at(self, repo: str, ref: str) -> str:
        return self._commit(repo, ref)[0]

    def file_at(self, repo: str, ref: str, path: str) -> str | None:
        return self._commit(repo, ref)[1].get(path)

    def folder_at(self, repo: str, ref: str, path: str) -> dict[str, str] | None:
        prefix = path.strip("/") + "/"
        inside = {rel[len(prefix):]: text for rel, text in self._commit(repo, ref)[1].items() if rel.startswith(prefix)}
        out = {}
        for name in sorted({rel.split("/", 1)[0] for rel in inside}):  # an id that changes when anything under the name does, as git's does
            below = sorted((rel, text) for rel, text in inside.items() if rel == name or rel.startswith(name + "/"))
            out[name] = hashlib.sha256(json.dumps(below).encode("utf-8")).hexdigest()
        return out or None

    def agent_credential(self) -> dict:
        """What the credential available to agents can do: {identity, permissions, scopes}. Simulated for tests."""
        if "agent_credential" not in self.data:
            raise KitError("the file adapter holds no description of the agent credential")
        return dict(self.data["agent_credential"])

    def setup_report(self) -> list[dict]:
        # A fixture may simulate a configured channel; `doctor` still says the file adapter proves nothing.
        return self.data.get("setup") or [{"item": "enforcement adapter", "status": "fail",
                                           "detail": "the file adapter is for tests only; no approval is bound to an identity"}]


class GitHubAdapter:
    """GitHub pull request reviews as the trust anchor, read through the `gh` CLI.

    Not exercised against a live repository in this slice's self-tests; its parsing is unit-tested
    with recorded responses.
    """

    name = "github"

    def __init__(self, repository: str | None, default_branch: str = "main", runner=None):
        self.repository = repository
        self.branch = default_branch
        self._run = runner or self._gh

    def _gh(self, path: str):
        if not shutil.which("gh"):
            raise KitError("the gh CLI is not installed, so the enforcement channel cannot be read")
        if path == "__token_scopes__":  # classic tokens state their scopes in a response header; fine-grained tokens do not
            p = subprocess.run(["gh", "api", "-i", "user"], capture_output=True, text=True)
            m = re.search(r"(?im)^x-oauth-scopes:\s*(.*)$", p.stdout or "")
            return [x.strip() for x in m.group(1).split(",") if x.strip()] if m else []
        p = subprocess.run(["gh", "api", "--paginate", path], capture_output=True, text=True)
        if p.returncode:
            raise KitError(f"gh api {path} failed: {p.stderr.strip()[:200]}")
        return json.loads(p.stdout or "null")

    def _repo(self) -> str:
        if not self.repository:
            raise KitError("enforcement.repository is not set in kit.yml (owner/name)")
        return self.repository

    def agent_identity(self):
        try:
            return (self._run("user") or {}).get("login")
        except KitError:
            return None

    def ci_identity(self):
        return "github-actions[bot]"

    def agent_credential(self) -> dict:
        """What the token in use can do on this repository, as GitHub reports it for the calling identity."""
        user = self._run("user") or {}
        repo = self._run(f"repos/{self._repo()}") or {}
        try:
            scopes = self._run("__token_scopes__") or []
        except KitError:
            scopes = []
        return {"identity": user.get("login", ""), "account_type": user.get("type", ""),
                "permissions": repo.get("permissions") or {}, "scopes": list(scopes)}

    @staticmethod
    def _number(change: str) -> str:
        m = re.fullmatch(r"pull/([1-9][0-9]*)", change)
        if not m:
            raise KitError(f"change reference {change!r} is not of the form pull/<number>")
        return m.group(1)

    def reviews(self, change: str) -> list[Review]:
        rows = self._run(f"repos/{self._repo()}/pulls/{self._number(change)}/reviews") or []
        return [Review(str(r.get("id")), (r.get("user") or {}).get("login", ""), (r.get("user") or {}).get("type", ""),
                       r.get("state", ""), r.get("commit_id", ""), r.get("body") or "") for r in rows]

    def authors(self, change: str) -> set[str]:
        rows = self._run(f"repos/{self._repo()}/pulls/{self._number(change)}/commits") or []
        return {(r.get("author") or {}).get("login", "").lower() for r in rows if (r.get("author") or {}).get("login")}

    def pulls(self, commits: list[str]) -> list[dict]:
        """The pull requests GitHub lists for each of these commits, each once (DLV-2). One request for each commit.

        Never run against GitHub: the form of a response is taken from its REST documentation. A request that fails
        is raised, as for the other calls. Before a merge `merge_commit_sha` names a test merge, so it is not passed on."""
        found: dict[str, dict] = {}
        for sha in commits:
            rows = self._run(f"repos/{self._repo()}/commits/{sha}/pulls") or []
            if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
                raise KitError(f"gh api repos/{self._repo()}/commits/{sha}/pulls did not give a list of pull requests")
            for row in rows:
                merged = bool(row.get("merged_at"))
                found.setdefault(f"pull/{row.get('number')}", {
                    "change": f"pull/{row.get('number')}", "state": "merged" if merged else ("closed" if row.get("state") == "closed" else "open"),
                    "head": str((row.get("head") or {}).get("ref") or ""), "base": str((row.get("base") or {}).get("ref") or ""),
                    "merge_commit": str(row.get("merge_commit_sha") or "") if merged else "", "url": str(row.get("html_url") or "")})
        return list(found.values())

    def _found(self, path: str):
        """One request for something that may not be there: None where GitHub answers Not Found. Any other failure is raised."""
        try:
            return self._run(path)
        except KitError as exc:
            if "HTTP 404" in str(exc):
                return None
            raise

    def commit_at(self, repo: str, ref: str) -> str:
        """The full id of a commit of another repository (PRG-11). Never run against GitHub: the form of a response is
        taken from its REST reference. GitHub answers a repository it will not show and one that does not exist alike."""
        row = self._run(f"repos/{repo}/commits/{ref}")
        sha = str(row.get("sha") or "") if isinstance(row, dict) else ""
        if not COMMIT_ID.fullmatch(sha):
            raise KitError(f"gh api repos/{repo}/commits/{ref} did not give a commit")
        return sha

    def file_at(self, repo: str, ref: str, path: str) -> str | None:
        """The text of a file at a commit of another repository; None where that commit holds no such file (PRG-11)."""
        row = self._found(f"repos/{repo}/contents/{path}" + (f"?ref={ref}" if ref else ""))
        if not isinstance(row, dict) or row.get("type") != "file":
            return None  # nothing there, or a folder
        if row.get("encoding") != "base64":  # GitHub sends no content for a file of more than one megabyte
            raise KitError(f"gh api repos/{repo}/contents/{path} gave no content for the file")
        try:
            return base64.b64decode(str(row.get("content") or "")).decode("utf-8", errors="replace")
        except ValueError as exc:
            raise KitError(f"gh api repos/{repo}/contents/{path} gave content that is not base64") from exc

    def folder_at(self, repo: str, ref: str, path: str) -> dict[str, str] | None:
        """name -> git's id for it, for what a folder holds at a commit of another repository; None where there is none (PRG-11).
        GitHub lists at most 1,000 names of one folder."""
        rows = self._found(f"repos/{repo}/contents/{path.strip('/')}" + (f"?ref={ref}" if ref else ""))
        if not isinstance(rows, list):
            return None  # nothing there, or a file
        return {str(row.get("name")): str(row.get("sha") or "") for row in rows if isinstance(row, dict) and row.get("name")}

    def setup_report(self) -> list[dict]:
        out = []
        try:
            prot = self._run(f"repos/{self._repo()}/branches/{self.branch}/protection") or {}
        except KitError as exc:
            return [{"item": "branch protection", "status": "not-checkable", "detail": str(exc)}]
        reviews = prot.get("required_pull_request_reviews") or {}
        out.append({"item": "pull request reviews required",
                    "status": "pass" if reviews.get("required_approving_review_count", 0) >= 1 else "fail",
                    "detail": f"required approvals: {reviews.get('required_approving_review_count', 0)}"})
        out.append({"item": "code owner review required",
                    "status": "pass" if reviews.get("require_code_owner_reviews") else "fail", "detail": ""})
        contexts = ((prot.get("required_status_checks") or {}).get("contexts")) or []
        out.append({"item": "agentic-checks is a required status check",
                    "status": "pass" if any("agentic" in c for c in contexts) else "fail", "detail": ", ".join(contexts)})
        out.append({"item": "administrators are not exempt",
                    "status": "pass" if (prot.get("enforce_admins") or {}).get("enabled") else "fail", "detail": ""})
        return out


def enforcement(ctx: Context):
    cfg = ctx.kit().get("enforcement") or {}
    name = cfg.get("adapter")
    if name == "file":
        return FileAdapter(ctx.src)
    if name == "github":
        return GitHubAdapter(cfg.get("repository"), cfg.get("default_branch", "main"))
    raise KitError(f"unknown enforcement adapter {name!r} in kit.yml")


# ── suppression detection (GOV-15) ──────────────────────────────────────────────

#: rule id -> (path globs, regex). Projects extend or replace these in kit.yml under `suppressions:`.
DEFAULT_SUPPRESSIONS = {
    "ci-escape": ([".github/workflows/*", ".gitlab-ci.yml", "azure-pipelines*.yml"],
                  r"continue-on-error:\s*true|\|\|\s*true\b"),
    "test-skip": (["*.ts", "*.tsx", "*.js", "*.jsx", "*.cs", "*.py", "*.java", "*.go"],
                  r"\b(?:test|it|describe)\.skip\(|\bx(?:it|describe)\(|\[(?:Fact|Theory)\([^\]]*Skip\s*=|@pytest\.mark\.skip|@Disabled\b|\bt\.Skip\("),
    "lint-disable": (["*.ts", "*.tsx", "*.js", "*.jsx", "*.cs", "*.py"],
                     r"eslint-disable|#pragma\s+warning\s+disable|#\s*noqa|#\s*type:\s*ignore"),
    "advisory-suppress": (["*.props", "*.csproj", ".npmrc", "*.yml", "*.yaml"],
                          r"NuGetAuditSuppress|audit-level\s*=\s*none|--ignore-vuln"),
}


#: Installed tooling and dependencies are not the project's own code. Override with `suppression_exclude:` in kit.yml.
DEFAULT_EXCLUDE = [".specify/*", ".claude/*", ".github/skills/*", ".github/agents/*", "node_modules/*", "vendor/*",
                   "specs/*", "*.min.js", "*.map"]


def find_suppressions(ctx: Context) -> list[dict]:
    """Every suppression in the tree, plus findings from sibling extensions. Computed once per context."""
    cached = getattr(ctx, "_suppressions", None)
    if cached is None:
        cached = _find_suppressions(ctx)
        ctx._suppressions = cached
    return cached


def _find_suppressions(ctx: Context) -> list[dict]:
    rules = dict(DEFAULT_SUPPRESSIONS)
    exclude = list(ctx.kit().get("suppression_exclude") or DEFAULT_EXCLUDE)
    for rid, spec in (ctx.kit().get("suppressions") or {}).items():
        if spec is None:
            rules.pop(rid, None)
        else:
            rules[rid] = (list(spec.get("paths", [])), spec.get("pattern", ""))
    compiled = {rid: (globs, re.compile(pat)) for rid, (globs, pat) in rules.items() if pat}
    import fnmatch
    found = []
    for rel in ctx.src.files():
        if any(fnmatch.fnmatch(rel, g) for g in exclude):
            continue
        name = rel.rsplit("/", 1)[-1]
        todo = [(rid, rx) for rid, (globs, rx) in compiled.items()
                if any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(name, g) for g in globs)]
        if not todo:
            continue
        try:
            text = ctx.src.read(rel)
        except (OSError, KitError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            for rid, rx in todo:
                if rx.search(line):
                    found.append({"rule": rid, "path": rel, "line": n, "text": line.strip()[:160]})
    from .core import FINDER_HOOKS
    for hook in FINDER_HOOKS:
        found += [f for f in hook(ctx) if not any(fnmatch.fnmatch(f["path"], g) for g in exclude)]
    return found
