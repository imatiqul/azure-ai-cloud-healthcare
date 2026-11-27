"""The tool allowlist (AGT-20): agents reach only the MCP servers a person approved, at the version approved.

An MCP server is code that runs with the agent's access and text that the agent reads as instructions. A server
added in passing, or one that quietly changes under a floating version, is a way into the repository that no review
saw. This check compares every MCP server configured for a coding agent with `.specify/agentic/tools.yml`, which
is read from the base branch: a change cannot add a server and approve it in the same breath.
"""
from __future__ import annotations

import json
import re

from agentic_kit.core import KIT_DIR, Context, Result, check

TOOLS = f"{KIT_DIR}/tools.yml"
SCHEMA = "agentic-tools/1"
SYS = ("standard", "regulated")
#: Files where coding agents read MCP servers from, and the key that holds them.
CONFIG_FILES = {
    ".mcp.json": "mcpServers",
    ".cursor/mcp.json": "mcpServers",
    ".vscode/mcp.json": "servers",
    ".gemini/settings.json": "mcpServers",
    ".kiro/settings/mcp.json": "mcpServers",
    ".claude/settings.json": "mcpServers",
    ".claude/settings.local.json": "mcpServers",
    ".codex/config.toml": "mcp_servers",
}
RUNNERS = {"npx", "bunx", "pnpx", "uvx", "pipx"}
_VERSIONED = re.compile(r".+(?:@|==)\d[\w.+-]*$")
_SECRET = re.compile(r"[A-Za-z0-9_\-]{24,}")
SKELETON = f"""schema: {SCHEMA}
# The MCP servers coding agents may use in this repository. Read from the base branch.
# A server launched through npx, uvx or similar must name an exact version; a container image must name a digest.
mcp_servers: []
#  - {{name: github, command: npx, args: ["-y", "@modelcontextprotocol/server-github@2025.4.8"], reviewed_by: <person>, reason: <why agents need it>}}
#  - {{name: docs, url: "https://mcp.example.com/mcp", reviewed_by: <person>, reason: <why>}}
"""


def _load(ctx: Context, rel: str):
    text = ctx.src.read(rel)
    if rel.endswith(".toml"):
        try:
            import tomllib
        except ImportError:  # Python 3.10
            return None
        return tomllib.loads(text)
    return json.loads(text)


def configured(ctx: Context) -> tuple[list[dict], list[tuple[str, str]]]:
    """Every MCP server an agent configuration in the repository names: ([{file, name, command, args, url, env}], [(problem, file)])."""
    extra = {str(f): "mcpServers" for f in ((ctx.kit().get("team") or {}).get("tools") or {}).get("files") or []}
    found, problems = [], []
    for rel, key in {**CONFIG_FILES, **extra}.items():
        if not ctx.src.exists(rel):
            continue
        try:
            data = _load(ctx, rel)
        except (ValueError, Exception) as exc:  # noqa: BLE001 - any parse error is reported the same way
            problems.append((f"cannot be read ({type(exc).__name__}); MCP servers in it cannot be checked", rel))
            continue
        if data is None:
            problems.append(("is TOML, which this Python version cannot read; run the checks on Python 3.11 or later", rel))
            continue
        if not isinstance(data, dict):
            continue
        if data.get("enableAllProjectMcpServers") is True:
            problems.append(("sets enableAllProjectMcpServers: any server added to .mcp.json would be trusted without a person looking", rel))
        servers = data.get(key)
        for name, body in (servers or {}).items() if isinstance(servers, dict) else []:
            if isinstance(body, dict):
                found.append({"file": rel, "name": str(name), "command": str(body.get("command") or ""), "args": [str(a) for a in body.get("args") or []],
                              "url": str(body.get("url") or body.get("httpUrl") or ""), "env": body.get("env") or {}})
    return found, problems


def allowlist(ctx: Context) -> tuple[dict[str, dict] | None, list[str]]:
    holder = ctx.trusted if ctx.trusted.exists(TOOLS) else ctx.src
    if not holder.exists(TOOLS):
        return None, []
    data = holder.yaml(TOOLS)
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        return {}, [f"must be a mapping with schema {SCHEMA}"]
    out, problems = {}, []
    for entry in data.get("mcp_servers") or []:
        if not isinstance(entry, dict) or not entry.get("name"):
            problems.append("each mcp_servers entry needs a name")
            continue
        if not entry.get("reviewed_by") or not str(entry.get("reason") or "").strip():
            problems.append(f"server {entry['name']} needs reviewed_by and reason: someone decided agents may use it, and why")
        out[str(entry["name"])] = entry
    return out, problems


def unpinned(command: str, args: list[str]) -> str | None:
    """Why this launch could run different code tomorrow, or None."""
    base = command.rsplit("/", 1)[-1].lower()
    if any(a.endswith("@latest") or a.endswith(":latest") for a in args):
        return "it asks for 'latest'"
    if base in RUNNERS:
        package = next((a for a in args if not a.startswith("-") and a not in ("run", "exec", "dlx")), None)
        if package is None:
            return "it names no package"
        if not _VERSIONED.fullmatch(package):
            return f"{package} names no exact version"
    if base in ("docker", "podman") and not any("@sha256:" in a for a in args):
        return "its container image is not named by digest"
    return None


@check("CK-TOOL-ALLOWLIST", ("AGT-20",), "every MCP server configured for an agent is on the allowlist, unchanged, and pinned to a version", profiles=SYS)
def ck_tool_allowlist(ctx: Context, res: Result) -> None:
    found, problems = configured(ctx)
    for message, rel in problems:
        res.fail(f"{rel} {message}", rel)
    allowed, bad = allowlist(ctx)
    for message in bad:
        res.fail(message, TOOLS)
    if not found:
        if allowed is None:
            res.notes.append("no MCP server is configured for an agent in this repository")
        return
    if allowed is None:
        res.fail(f"{len(found)} MCP server(s) are configured for agents and there is no allowlist. Create {TOOLS} and have each server reviewed", found[0]["file"])
        return
    for s in found:
        where = s["file"]
        entry = allowed.get(s["name"])
        if entry is None:
            res.fail(f"MCP server '{s['name']}' is not on the allowlist. A server is code that runs with the agent's access; add it to {TOOLS} in a change of its own", where)
            continue
        if s["url"]:
            if s["url"] != str(entry.get("url") or ""):
                res.fail(f"MCP server '{s['name']}' points at a different address from the one that was reviewed", where)
            if not s["url"].startswith("https://"):
                res.fail(f"MCP server '{s['name']}' is not reached over https", where)
        else:
            if s["command"] != str(entry.get("command") or "") or s["args"] != [str(a) for a in entry.get("args") or []]:
                res.fail(f"MCP server '{s['name']}' is launched differently from what was reviewed "
                         f"({' '.join([s['command']] + s['args'])[:140]}). Review the new launch and update the allowlist first", where)
            why = unpinned(s["command"], s["args"])
            if why:
                res.fail(f"MCP server '{s['name']}' is not pinned: {why}. What runs must be what was reviewed", where)
        for key, value in (s["env"] or {}).items():
            if isinstance(value, str) and "${" not in value and not value.startswith("$") and _SECRET.fullmatch(value):
                res.fail(f"MCP server '{s['name']}' has what looks like a credential stored in {key}; reference an environment variable instead", where)
