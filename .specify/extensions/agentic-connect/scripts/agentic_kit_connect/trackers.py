"""Where requirements come from, and where notes about them go back to (ADP-18).

One adapter per platform. Each does two things: `fetch` returns work items in one neutral shape, and `note` posts a
short note on a work item, once. Three of them do a third: `discussion` returns the comments on one item, of which
`fetch_sources` keeps a count and a hash and nothing else (CNV-6). Adapters hold no state and write nothing to the
repository; `fetch_sources` turns what they return into intake records.

None of these adapters has been run against the live service. They are tested against recorded responses that
follow each vendor's published API (see docs/adapters/trackers.md for the endpoints and the date they were read).
"""
from __future__ import annotations

import csv
import fnmatch
import hashlib
import html
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

from agentic_kit.core import Context, KitError, front_matter, unix_line_ends

from .transport import basic, expect, secret

MAX_PAGES = 20
PAGE = 100           # comments asked for at a time
COMMENT_PAGES = 20   # and how many times: at most 2,000 comments of one item are read (CNV-8)
#: A note the kit posted on the item itself, as `notify.render_note` writes it. It is no part of what people said (CNV-7).
KIT_NOTE = re.compile(r"\Aagentic-spec-kit: .*\(ref agentic:[^\s()]+\)\Z", re.S)
_BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "ul", "ol", "table", "blockquote"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.title = ""
        self._in_title = self._in_h1 = False
        self.h1 = ""

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "template"):
            self.skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self._in_h1 = True
        if tag in _BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "template"):
            self.skip = max(0, self.skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False
        if tag in _BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self.skip:
            return
        if self._in_h1:
            self.h1 += data
        self.out.append(data)


def html_text(markup: str) -> tuple[str, str]:
    """(plain text, title) of an HTML fragment or page. Scripts and styles are dropped."""
    parser = _Text()
    parser.feed(markup or "")
    text = "".join(parser.out)
    lines = [" ".join(line.split()) for line in text.splitlines()]
    clean = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return clean, " ".join((parser.title or parser.h1).split())


def adf_text(node) -> str:
    """Plain text of a Jira document (Atlassian Document Format)."""
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""
    kind = node.get("type")
    if kind == "text":
        return str(node.get("text", ""))
    if kind == "hardBreak":
        return "\n"
    inner = "".join(adf_text(c) for c in node.get("content") or [])
    return inner + ("\n" if kind in ("paragraph", "heading", "listItem", "codeBlock", "blockquote") else "")


def adf_doc(text: str) -> dict:
    return {"type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": line}]} for line in text.splitlines() if line.strip()]}


def _item(key, title, body="", url="", revision="", **meta) -> dict:
    return {"key": str(key), "title": str(title or ""), "body": str(body or ""), "url": str(url or ""), "revision": str(revision or ""),
            **{k: v for k, v in meta.items() if v not in (None, "", [])}}


def _comment(cid, author, body) -> dict:
    return {"id": "" if cid is None else str(cid), "author": str(author or ""), "body": str(body or "")}


class Adapter:
    platform = ""

    def __init__(self, cfg: dict, transport, env: dict | None = None, root: Path | None = None):
        self.cfg, self.t, self.env, self.root = cfg, transport, env, root
        self.used: list[str] = []  # secret values this adapter read, so error text can be scrubbed

    def need(self, *names: str) -> None:
        missing = [n for n in names if not self.cfg.get(n)]
        if missing:
            raise KitError(f"source {self.cfg.get('id', '?')} ({self.platform}) is missing {', '.join(missing)} in connect.yml")

    def secret(self, field: str) -> str:
        value = secret((self.cfg.get("auth") or {}).get(field, ""), self.env)
        self.used.append(value)
        return value

    def fetch(self) -> list[dict]:
        raise NotImplementedError

    def note(self, key: str, text: str, marker: str) -> str:
        raise NotImplementedError

    def discussion(self, key: str) -> tuple[list[dict], bool] | None:
        """The comments on one item, each as {id, author, body}, and whether that is all of them. None where there are none to read."""
        return None


class Jira(Adapter):
    platform = "jira"
    FIELDS = ["summary", "description", "issuetype", "priority", "labels", "status", "updated"]

    def _base(self) -> tuple[str, dict]:
        self.need("base_url")
        return str(self.cfg["base_url"]).rstrip("/"), {"Authorization": basic(self.secret("user_env"), self.secret("token_env")), "Accept": "application/json"}

    def fetch(self) -> list[dict]:
        self.need("query")
        base, headers = self._base()
        items, token = [], None
        for _ in range(MAX_PAGES):
            body = {"jql": self.cfg["query"], "fields": self.FIELDS, "maxResults": 100}
            if token:
                body["nextPageToken"] = token
            data = expect(self.t.request("POST", f"{base}/rest/api/3/search/jql", headers, body), "the Jira search").json()
            issues = data.get("issues") or []
            for issue in issues:
                f = issue.get("fields") or {}
                items.append(_item(issue.get("key"), f.get("summary"), adf_text(f.get("description")).strip(), f"{base}/browse/{issue.get('key')}",
                                   f.get("updated"), type=(f.get("issuetype") or {}).get("name"), priority=(f.get("priority") or {}).get("name"),
                                   labels=f.get("labels") or [], state=(f.get("status") or {}).get("name")))
            token = data.get("nextPageToken")
            if not token or not issues:  # stop on an empty page as well: do not rely on isLast alone
                break
        return items

    def note(self, key: str, text: str, marker: str) -> str:
        base, headers = self._base()
        url = f"{base}/rest/api/3/issue/{quote(key)}/comment"
        seen = expect(self.t.request("GET", url, headers), "reading Jira comments").json()
        if any(marker in adf_text(c.get("body")) for c in seen.get("comments") or []):
            return "exists"
        expect(self.t.request("POST", url, headers, {"body": adf_doc(text)}), "posting the Jira comment")
        return "posted"

    def discussion(self, key: str) -> tuple[list[dict], bool]:
        base, headers = self._base()
        url = f"{base}/rest/api/3/issue/{quote(key)}/comment"
        out: list[dict] = []
        for _ in range(COMMENT_PAGES):
            data = expect(self.t.request("GET", f"{url}?startAt={len(out)}&maxResults={PAGE}", headers), "reading Jira comments").json()
            batch = [c for c in data.get("comments") or [] if isinstance(c, dict)]
            out += [_comment(c.get("id"), (c.get("author") or {}).get("accountId") or (c.get("author") or {}).get("displayName"),
                             adf_text(c.get("body"))) for c in batch]
            size, total = data.get("maxResults"), data.get("total")  # the service may give fewer at a time than was asked for
            more = len(batch) >= (size if isinstance(size, int) and size > 0 else PAGE) or (isinstance(total, int) and len(out) < total)
            if not batch or not more:
                return out, True
        return out, False


class Ado(Adapter):
    platform = "ado"
    API = "https://dev.azure.com"

    def _base(self) -> tuple[str, dict]:
        self.need("organization", "project")
        return (f"{self.API}/{quote(str(self.cfg['organization']))}/{quote(str(self.cfg['project']))}",
                {"Authorization": basic("", self.secret("token_env")), "Accept": "application/json"})

    def fetch(self) -> list[dict]:
        self.need("wiql")
        base, headers = self._base()
        found = expect(self.t.request("POST", f"{base}/_apis/wit/wiql?api-version=7.1", headers, {"query": self.cfg["wiql"]}), "the Azure DevOps query").json()
        ids = [str(w.get("id")) for w in found.get("workItems") or [] if w.get("id") is not None]
        items = []
        for i in range(0, len(ids), 200):
            data = expect(self.t.request("GET", f"{base}/_apis/wit/workitems?ids={','.join(ids[i:i + 200])}&api-version=7.1", headers),
                          "reading Azure DevOps work items").json()
            for w in data.get("value") or []:
                f = w.get("fields") or {}
                body = html_text(f.get("System.Description") or "")[0]
                criteria = html_text(f.get("Microsoft.VSTS.Common.AcceptanceCriteria") or "")[0]
                if criteria:
                    body = f"{body}\n\nAcceptance criteria:\n{criteria}".strip()
                items.append(_item(w.get("id"), f.get("System.Title"), body, f"{base}/_workitems/edit/{w.get('id')}", w.get("rev"),
                                   type=f.get("System.WorkItemType"), priority=f.get("Microsoft.VSTS.Common.Priority"),
                                   labels=[t.strip() for t in str(f.get("System.Tags") or "").split(";") if t.strip()], state=f.get("System.State")))
        return items

    def note(self, key: str, text: str, marker: str) -> str:
        base, headers = self._base()
        url = f"{base}/_apis/wit/workItems/{quote(str(key))}/comments"
        seen = expect(self.t.request("GET", f"{url}?api-version=7.1-preview.4", headers), "reading Azure DevOps comments").json()
        if any(marker in html_text(str(c.get("text") or ""))[0] for c in seen.get("comments") or []):
            return "exists"
        expect(self.t.request("POST", f"{url}?api-version=7.0-preview.3", headers, {"text": html.escape(text).replace("\n", "<br>")}),
               "posting the Azure DevOps comment")
        return "posted"

    def discussion(self, key: str) -> tuple[list[dict], bool]:
        base, headers = self._base()
        url = f"{base}/_apis/wit/workItems/{quote(str(key))}/comments?$top={PAGE}&api-version=7.1-preview.4"
        out: list[dict] = []
        token = None
        for _ in range(COMMENT_PAGES):
            more = f"&continuationToken={quote(str(token), safe='')}" if token else ""
            data = expect(self.t.request("GET", url + more, headers), "reading Azure DevOps comments").json()
            batch = [c for c in data.get("comments") or [] if isinstance(c, dict)]
            for c in batch:
                who = c.get("createdBy") or {}
                if not c.get("isDeleted"):  # the reference names the id `id`, and its samples `commentId`
                    out.append(_comment(c.get("id") if c.get("id") is not None else c.get("commentId"),
                                        who.get("id") or who.get("uniqueName") or who.get("displayName"), html_text(str(c.get("text") or ""))[0]))
            token = data.get("continuationToken")
            if not token or not batch:
                return out, True
        return out, False


class ClickUp(Adapter):
    platform = "clickup"
    API = "https://api.clickup.com/api/v2"

    def _headers(self) -> dict:
        return {"Authorization": self.secret("token_env"), "Accept": "application/json"}

    def fetch(self) -> list[dict]:
        self.need("list")
        headers, items = self._headers(), []
        for page in range(MAX_PAGES):
            data = expect(self.t.request("GET", f"{self.API}/list/{quote(str(self.cfg['list']))}/task?page={page}&include_closed=false", headers),
                          "reading ClickUp tasks").json()
            tasks = data.get("tasks") or []
            for t in tasks:
                items.append(_item(t.get("id"), t.get("name"), t.get("text_content") or t.get("description") or "", t.get("url"), t.get("date_updated"),
                                   priority=(t.get("priority") or {}).get("priority"), labels=[g.get("name") for g in t.get("tags") or [] if g.get("name")],
                                   state=(t.get("status") or {}).get("status")))
            if data.get("last_page", True) or not tasks:
                break
        return items

    def note(self, key: str, text: str, marker: str) -> str:
        headers, url = self._headers(), f"{self.API}/task/{quote(str(key))}/comment"
        seen = expect(self.t.request("GET", url, headers), "reading ClickUp comments").json()
        if any(marker in str(c.get("comment_text") or "") for c in seen.get("comments") or []):
            return "exists"
        expect(self.t.request("POST", url, headers, {"comment_text": text, "notify_all": False}), "posting the ClickUp comment")
        return "posted"


PROJECT_QUERY = """query($login: String!, $number: Int!, $after: String) {
  owner: %s(login: $login) {
    projectV2(number: $number) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            __typename
            ... on Issue { number title body url updatedAt state repository { nameWithOwner } labels(first: 20) { nodes { name } } }
            ... on DraftIssue { title body updatedAt }
          }
        }
      }
    }
  }
}"""


class GitHub(Adapter):
    platform = "github"

    def _base(self) -> tuple[str, dict]:
        return (str(self.cfg.get("api_url") or "https://api.github.com").rstrip("/"),
                {"Authorization": f"Bearer {self.secret('token_env')}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "agentic-spec-kit"})

    def fetch(self) -> list[dict]:
        if not self.cfg.get("repo") and not self.cfg.get("project"):
            self.need("repo")
        api, headers = self._base()
        items = []
        if self.cfg.get("repo"):
            repo = str(self.cfg["repo"])
            labels = ",".join(quote(str(x)) for x in self.cfg.get("labels") or [])
            for page in range(1, MAX_PAGES + 1):
                url = f"{api}/repos/{repo}/issues?state=open&per_page=100&page={page}" + (f"&labels={labels}" if labels else "")
                batch = expect(self.t.request("GET", url, headers), "reading GitHub issues").json()
                for issue in batch if isinstance(batch, list) else []:
                    if "pull_request" in issue:
                        continue  # the issues endpoint also lists pull requests
                    items.append(_item(f"{repo}#{issue.get('number')}", issue.get("title"), issue.get("body"), issue.get("html_url"), issue.get("updated_at"),
                                       labels=[x.get("name") for x in issue.get("labels") or [] if isinstance(x, dict)], state=issue.get("state")))
                if not isinstance(batch, list) or len(batch) < 100:
                    break
        project = self.cfg.get("project")
        if project:
            kind = "user" if project.get("owner_type") == "user" else "organization"
            after, seen = None, {i["key"] for i in items}
            for _ in range(MAX_PAGES):
                body = {"query": PROJECT_QUERY % kind, "variables": {"login": project.get("owner"), "number": int(project.get("number", 0)), "after": after}}
                data = expect(self.t.request("POST", f"{api}/graphql", headers, body), "reading the GitHub project").json()
                if data.get("errors"):
                    raise KitError("reading the GitHub project failed: " + "; ".join(str(e.get("message")) for e in data["errors"])[:300])
                block = ((((data.get("data") or {}).get("owner") or {}).get("projectV2") or {}).get("items") or {})
                for node in block.get("nodes") or []:
                    c = node.get("content") or {}
                    if c.get("__typename") == "Issue":
                        key = f"{(c.get('repository') or {}).get('nameWithOwner')}#{c.get('number')}"
                        if key not in seen:
                            seen.add(key)
                            items.append(_item(key, c.get("title"), c.get("body"), c.get("url"), c.get("updatedAt"),
                                               labels=[x.get("name") for x in (c.get("labels") or {}).get("nodes") or []], state=c.get("state")))
                    elif c.get("__typename") == "DraftIssue":
                        items.append(_item(f"project-{project.get('owner')}-{project.get('number')}-draft-{node.get('id')}", c.get("title"), c.get("body"),
                                           "", c.get("updatedAt"), type="draft"))
                page = block.get("pageInfo") or {}
                if not page.get("hasNextPage"):
                    break
                after = page.get("endCursor")
        return items

    def note(self, key: str, text: str, marker: str) -> str:
        m = re.fullmatch(r"([\w.-]+/[\w.-]+)#(\d+)", key)
        if not m:
            return "skipped: a draft project item cannot take a comment"
        api, headers = self._base()
        url = f"{api}/repos/{m.group(1)}/issues/{m.group(2)}/comments"
        for page in range(1, 6):
            batch = expect(self.t.request("GET", f"{url}?per_page=100&page={page}", headers), "reading GitHub comments").json()
            if any(marker in str(c.get("body") or "") for c in batch if isinstance(c, dict)):
                return "exists"
            if not isinstance(batch, list) or len(batch) < 100:
                break
        expect(self.t.request("POST", url, headers, {"body": text}), "posting the GitHub comment")
        return "posted"

    def discussion(self, key: str) -> tuple[list[dict], bool] | None:
        m = re.fullmatch(r"([\w.-]+/[\w.-]+)#(\d+)", key)
        if not m:
            return None  # a draft project item has no comments
        api, headers = self._base()
        url = f"{api}/repos/{m.group(1)}/issues/{m.group(2)}/comments"
        out: list[dict] = []
        for page in range(1, COMMENT_PAGES + 1):
            batch = expect(self.t.request("GET", f"{url}?per_page={PAGE}&page={page}", headers), "reading GitHub comments").json()
            batch = [c for c in batch if isinstance(c, dict)] if isinstance(batch, list) else []
            out += [_comment(c.get("id"), (c.get("user") or {}).get("login"), c.get("body")) for c in batch]
            if len(batch) < PAGE:
                return out, True
        return out, False


class Documents(Adapter):
    """Requirements that arrive as files: Markdown, text, HTML, CSV or JSON. An exported Claude artifact is one of these."""
    platform = "document"
    TITLE = ("title", "summary", "name", "subject")
    BODY = ("description", "body", "details", "text", "content")
    KEY = ("id", "key", "number")

    def _pick(self, row: dict, names: tuple) -> str:
        low = {str(k).strip().lower(): v for k, v in row.items() if k is not None}
        return next((str(low[n]).strip() for n in names if low.get(n) not in (None, "")), "")

    def _rows(self, rel: str, rows: list) -> list[dict]:
        out = []
        for n, row in enumerate(rows, 1):
            if not isinstance(row, dict) or not self._pick(row, self.TITLE):
                continue
            meta = {k: self._pick(row, (k,)) for k in ("type", "priority")}
            labels = self._pick(row, ("labels", "tags"))
            out.append(_item(f"{rel}#{self._pick(row, self.KEY) or n}", self._pick(row, self.TITLE), self._pick(row, self.BODY), "", "",
                             labels=[x.strip() for x in re.split(r"[;,]", labels) if x.strip()], **meta))
        return out

    def fetch(self) -> list[dict]:
        self.need("paths")
        if self.root is None:
            raise KitError("the document source needs the repository root")
        root = Path(self.root).resolve()
        files = sorted(p for p in root.rglob("*") if p.is_file() and ".git" not in p.relative_to(root).parts)
        items = []
        for glob in self.cfg["paths"]:
            if str(glob).startswith(("/", "\\")) or ".." in Path(str(glob)).parts:
                raise KitError(f"document path {glob!r} must stay inside the repository")
            for path in files:
                rel = path.relative_to(root).as_posix()
                if not fnmatch.fnmatch(rel, str(glob)):
                    continue
                raw = unix_line_ends(path.read_bytes())  # so that a document has one revision on every checkout
                rev = hashlib.sha256(raw).hexdigest()[:12]
                text = raw.decode("utf-8-sig", "replace")
                ext = path.suffix.lower()
                found: list[dict] = []
                if ext in (".md", ".markdown"):
                    front = front_matter(text)
                    body = re.sub(r"\A---\s*\n.*?\n---\s*(?:\n|\Z)", "", text, count=1, flags=re.S)
                    m = re.search(r"^#\s+(.+?)\s*$", body, re.M)
                    title = str(front.get("title") or (m.group(1) if m else path.stem))
                    found = [_item(str(front.get("key") or rel), title, body.replace(m.group(0), "", 1).strip() if m else body.strip(), "", rev,
                                   type=front.get("type"), priority=front.get("priority"), labels=front.get("labels") or [])]
                elif ext == ".txt":
                    lines = text.strip().splitlines()
                    found = [_item(rel, lines[0] if lines else path.stem, "\n".join(lines[1:]).strip(), "", rev)]
                elif ext in (".html", ".htm"):
                    body, title = html_text(text)
                    found = [_item(rel, title or path.stem, body, "", rev)]
                elif ext == ".csv":
                    found = self._rows(rel, list(csv.DictReader(io.StringIO(text))))
                elif ext == ".json":
                    try:
                        data = json.loads(text)
                    except ValueError as exc:
                        raise KitError(f"{rel} is not valid JSON: {exc}") from exc
                    rows = data if isinstance(data, list) else (data.get("items") or data.get("issues") or data.get("requirements") or [data])
                    found = self._rows(rel, rows)
                else:
                    raise KitError(f"{rel}: documents are read from .md, .txt, .html, .csv and .json files")
                for it in found:
                    it["revision"] = it["revision"] or rev
                items += found
        return items

    def note(self, key: str, text: str, marker: str) -> str:
        return "skipped: a document has nowhere to post a note"


ADAPTERS = {"jira": Jira, "ado": Ado, "clickup": ClickUp, "github": GitHub, "document": Documents}


def adapter_for(source: dict, transport, env: dict | None = None, root: Path | None = None) -> Adapter:
    kind = source.get("platform")
    if kind not in ADAPTERS:
        raise KitError(f"source {source.get('id', '?')}: platform must be one of {', '.join(ADAPTERS)}")
    return ADAPTERS[kind](source, transport, env, root)


def fetch_sources(ctx: Context, sources: list[dict], transport, env: dict | None = None, only: str | None = None, write: bool = True) -> list[dict]:
    """Fetch every configured source and turn each item into an intake record. Returns one row per item.

    Where the source has comments to read, the record also gets a count and a hash of them (CNV-6). The comments are
    read before anything of the record is written, so a read that fails leaves the record as it was (CNV-8)."""
    from agentic_kit_product import conversation, intake
    patterns = intake.screens(ctx)
    rows = []
    for source in sources:
        if only and source.get("id") != only:
            continue
        adapter = adapter_for(source, transport, env, ctx.src.root)
        for item in adapter.fetch():
            meta = {k: item[k] for k in ("type", "priority", "labels") if k in item}
            rec = intake.make_record(adapter.platform, item["key"], item["title"] or item["key"], item["body"], url=item["url"], revision=item["revision"],
                                     fetched=ctx.options.get("today"), patterns=patterns, via=str(source.get("id", "")), **meta)
            said = adapter.discussion(item["key"])
            found = None
            if said is not None:  # the kit's own notes are no part of what people said (CNV-7)
                found = conversation.digest([c for c in said[0] if not KIT_NOTE.match(c["body"].strip())], patterns, rec["source"]["fetched"], said[1])
            if write:
                rel, action = intake.upsert(ctx.src.root, rec)
            else:
                rel, action = intake.path_of(rec["id"]), "new" if not ctx.src.exists(intake.path_of(rec["id"])) else "would compare"
            rows.append({"source": source.get("id"), "key": item["key"], "id": rec["id"], "action": action, "path": rel,
                         "screened": rec.get("screened") or {},
                         "discussion": conversation.store_digest(ctx.src.root, rec["id"], found, write) if found else None})
    return rows
