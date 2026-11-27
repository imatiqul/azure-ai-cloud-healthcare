"""Checks for the connect extension (ADP-17, NTF-2, PIP-3 to PIP-5)."""
from __future__ import annotations

import re
import string

import yaml

from agentic_kit.core import KIT_DIR, Context, Result, check

from .notify import CHANNELS, EVENTS, FIELDS
from .trackers import ADAPTERS

CONNECT = f"{KIT_DIR}/connect.yml"
SCHEMA = "agentic-connect/1"
ENV_NAME = re.compile(r"[A-Z][A-Z0-9_]*")
NEEDS = {"jira": ("base_url", "query"), "ado": ("organization", "project", "wiql"), "clickup": ("list",), "github": (), "document": ("paths",)}
AUTH = {"jira": ("user_env", "token_env"), "ado": ("token_env",), "clickup": ("token_env",), "github": ("token_env",), "document": ()}
AGENT_COMMANDS = ["claude", "copilot", "codex", "gemini", "cursor-agent", "aider", "opencode", "amp", "auggie", "qwen", "kiro-cli",
                  "anthropics/claude-code-action", "openai/codex-action", "google-github-actions/run-gemini-cli"]
PIPELINES = [".github/workflows/*.yml", ".github/workflows/*.yaml", "azure-pipelines*.yml", ".azure-pipelines/*.yml", ".gitlab-ci.yml",
             ".gitlab/ci/*.yml", "Jenkinsfile", "bitbucket-pipelines.yml", ".circleci/config.yml"]

#: Shapes of real credentials. A value that matches is a secret stored in a file, whatever it is called.
SECRET_SHAPES = {
    "a Slack webhook": re.compile(r"https://hooks\.slack\.com/(?:services|workflows|triggers)/[A-Za-z0-9/_-]{8,}"),
    "a Teams or Power Automate webhook": re.compile(r"https://[\w.-]+\.(?:logic\.azure\.com|powerplatform\.com|webhook\.office\.com)[^\s\"']*sig=[\w%-]+", re.I),
    "a GitHub token": re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    "a Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"),
    "an Atlassian API token": re.compile(r"\bATATT[A-Za-z0-9_=-]{20,}\b"),
    "a ClickUp token": re.compile(r"\bpk_\d+_[A-Z0-9]{20,}\b"),
    "a URL with a password in it": re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/:@]+:(?![$<{])[^\s/@]{3,}@")  # a reference to a variable is not a stored password,
}
_REFERENCE = re.compile(r"^\s*(?:\$\{\{.*\}\}|\$\(.*\)|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|credentials\(.*\)|<.*>)?\s*$")


def raw_config(ctx: Context) -> dict | None:
    """connect.yml as this change has it (the copy the checks validate)."""
    if not ctx.src.exists(CONNECT):
        return None
    data = ctx.src.yaml(CONNECT)
    return data if isinstance(data, dict) else {}


def secret_names(cfg: dict) -> set[str]:
    """Every environment variable name connect.yml says holds a secret."""
    names = {str(n) for n in cfg.get("pipeline_secrets") or []}
    for s in cfg.get("sources") or []:
        names |= {str(v) for k, v in ((s or {}).get("auth") or {}).items() if k.endswith("_env") and v}
    for c in (cfg.get("notify") or {}).get("channels") or []:
        if (c or {}).get("webhook_env"):
            names.add(str(c["webhook_env"]))
        names |= {str(v) for k, v in ((c or {}).get("smtp") or {}).items() if k.endswith("_env") and v}
    return names


def shapes_in(text: str) -> list[str]:
    return [what for what, pattern in SECRET_SHAPES.items() if pattern.search(text)]


@check("CK-CONNECT-CONFIG", ("ADP-17", "ADP-18", "PIP-4"), "connections to other systems are complete, use https, and name their secrets without holding them")
def ck_connect_config(ctx: Context, res: Result) -> None:
    cfg = raw_config(ctx)
    if cfg is None:
        res.notes.append("no connect.yml: this repository is not connected to a tracker or a notification channel")
        return
    for what in shapes_in(ctx.src.read(CONNECT)):
        res.fail(f"connect.yml contains {what}. Put the value in the pipeline's secret store and name the variable here", CONNECT)
    if cfg.get("schema") != SCHEMA:
        res.fail(f"schema must be {SCHEMA}", CONNECT)
    seen = set()
    for s in cfg.get("sources") or []:
        if not isinstance(s, dict) or not s.get("id"):
            res.fail("each source needs an id", CONNECT)
            continue
        sid, kind = str(s["id"]), s.get("platform")
        if sid in seen:
            res.fail(f"source id {sid} is used twice", CONNECT)
        seen.add(sid)
        if kind not in ADAPTERS:
            res.fail(f"source {sid}: platform must be one of {', '.join(ADAPTERS)}", CONNECT)
            continue
        for f in NEEDS[kind]:
            if not s.get(f):
                res.fail(f"source {sid} ({kind}) is missing {f}", CONNECT)
        if kind == "github" and not s.get("repo") and not s.get("project"):
            res.fail(f"source {sid} (github) needs repo, project or both", CONNECT)
        for f in AUTH[kind]:
            name = str((s.get("auth") or {}).get(f) or "")
            if not ENV_NAME.fullmatch(name):
                res.fail(f"source {sid}: auth.{f} must be the NAME of an environment variable the pipeline sets (got {name or 'nothing'})", CONNECT)
        for f in ("base_url", "api_url"):
            if s.get(f) and not str(s[f]).startswith("https://"):
                res.fail(f"source {sid}: {f} must start with https://", CONNECT)
    notify = cfg.get("notify") or {}
    channels = {}
    for c in notify.get("channels") or []:
        if not isinstance(c, dict) or not c.get("id"):
            res.fail("each notification channel needs an id", CONNECT)
            continue
        cid = str(c["id"])
        channels[cid] = c
        if c.get("type") not in CHANNELS:
            res.fail(f"channel {cid}: type must be one of {', '.join(CHANNELS)}", CONNECT)
        if c.get("type") in ("slack", "teams") and not ENV_NAME.fullmatch(str(c.get("webhook_env") or "")):
            res.fail(f"channel {cid}: webhook_env must be the NAME of an environment variable; a webhook address is a secret", CONNECT)
        if c.get("type") == "email":
            smtp = c.get("smtp") or {}
            if not ENV_NAME.fullmatch(str(smtp.get("host_env") or "")) or not smtp.get("from") or not c.get("to"):
                res.fail(f"channel {cid}: email needs smtp.host_env, smtp.from and to", CONNECT)
            for f in ("user_env", "password_env"):
                if smtp.get(f) and not ENV_NAME.fullmatch(str(smtp[f])):
                    res.fail(f"channel {cid}: smtp.{f} must be the NAME of an environment variable", CONNECT)
    for i, route in enumerate(notify.get("routes") or [], 1):
        for e in (route or {}).get("events") or []:
            if e != "*" and e not in EVENTS:
                res.fail(f"route {i} names event {e}; the events are {', '.join(EVENTS)}", CONNECT)
        for c in (route or {}).get("channels") or []:
            if str(c) not in channels:
                res.fail(f"route {i} sends to channel {c}, which is not defined", CONNECT)


@check("CK-NOTIFY-CONTENT", ("NTF-2", "NTF-3"), "a notification can carry identifiers, a status and a link, and nothing else")
def ck_notify_content(ctx: Context, res: Result) -> None:
    cfg = raw_config(ctx)
    if cfg is None:
        res.notes.append("no connect.yml")
        return
    notify = cfg.get("notify") or {}
    for key in ("include_text", "include_body", "include_evidence", "attach"):
        if notify.get(key):
            res.fail(f"notify.{key} is not supported: spec text and evidence do not leave the repository through a notification", CONNECT)
    for event, template in (notify.get("templates") or {}).items():
        if event not in EVENTS:
            res.fail(f"a template is given for {event}, which is not an event", CONNECT)
            continue
        try:
            used = [name for _, name, _, _ in string.Formatter().parse(str(template)) if name is not None]
        except ValueError as exc:
            res.fail(f"the template for {event} is malformed: {exc}", CONNECT)
            continue
        for name in used:
            if name not in FIELDS:
                res.fail(f"the template for {event} uses {{{name}}}. A notification may use only {', '.join('{' + f + '}' for f in FIELDS)}", CONNECT)
        if len(str(template)) > 200:
            res.fail(f"the template for {event} is longer than 200 characters; it is a headline, not a message body", CONNECT)


def _agent_step(step: dict, commands: list[str]) -> str | None:
    text = f"{step.get('run') or ''}\n{step.get('uses') or ''}"
    for cmd in commands:
        if re.search(rf"(?<![\w./-]){re.escape(cmd)}(?![\w-])", text):
            return cmd
    return None


def _env_names(block) -> set[str]:
    return {str(k) for k in (block.get("env") or {})} if isinstance(block, dict) and isinstance(block.get("env"), dict) else set()


@check("CK-PIPELINE-SECRETS", ("PIP-3", "PIP-5"), "pipelines hold no secret, and a step that runs an agent cannot read a tracker or notification credential")
def ck_pipeline_secrets(ctx: Context, res: Result) -> None:
    import fnmatch
    cfg = raw_config(ctx)
    if cfg is None:
        res.notes.append("no connect.yml")
        return
    names = secret_names(cfg)
    commands = [str(c) for c in cfg.get("agent_commands") or AGENT_COMMANDS]
    files = [p for p in ctx.src.files("") if any(fnmatch.fnmatch(p, g) for g in PIPELINES)]
    for rel in files:
        text = ctx.src.read(rel)
        for what in shapes_in(text):
            res.fail(f"the pipeline contains {what}; it belongs in the secret store", rel)
        for n, line in enumerate(text.splitlines(), 1):
            m = re.match(r"^\s*-?\s*([A-Z][A-Z0-9_]*)\s*[:=]\s*(.*?)\s*$", line)
            if m and m.group(1) in names and not _REFERENCE.match(m.group(2).strip("'\"")):
                res.fail(f"{m.group(1)} is given a literal value; reference the secret store instead", f"{rel}:{n}")
        if not rel.startswith(".github/workflows/"):
            continue
        try:
            flow = yaml.safe_load(text)
        except yaml.YAMLError:
            res.fail("the workflow is not valid YAML", rel)
            continue
        if not isinstance(flow, dict):
            continue
        triggers = flow.get("on", flow.get(True))  # YAML reads a bare `on` key as the boolean true
        trigger_names = set(triggers) if isinstance(triggers, (dict, list)) else {str(triggers)}
        uses_secret = sorted(n for n in names if re.search(rf"\b{re.escape(n)}\b", text))
        if "pull_request_target" in trigger_names and uses_secret:
            res.fail("the workflow runs on pull_request_target and uses a tracker or notification secret: code from a fork would run with it", rel)
        elif "pull_request" in trigger_names and uses_secret:
            res.fail(f"the workflow runs on pull_request and uses {', '.join(uses_secret)}. A pull request can change this file and the kit's own code, "
                     "so whoever opens one could read the secret. Notify from a workflow_run or push trigger, which runs the default branch's copy", rel)
        top = _env_names(flow)
        for jid, job in (flow.get("jobs") or {}).items():
            if not isinstance(job, dict):
                continue
            scope = top | _env_names(job)
            for step in job.get("steps") or []:
                if not isinstance(step, dict):
                    continue
                cmd = _agent_step(step, commands)
                visible = sorted((scope | _env_names(step)) & names)
                if cmd and visible:
                    res.fail(f"job {jid} runs an agent ({cmd}) in a step that can read {', '.join(visible)}. "
                             "Give agents no tracker or notification credential: move the agent to its own job", rel)
