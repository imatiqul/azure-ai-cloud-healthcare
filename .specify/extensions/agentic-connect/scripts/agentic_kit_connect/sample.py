"""Self-test material for the connect extension."""
from __future__ import annotations

from pathlib import Path

from agentic_kit import selftest
from agentic_kit.core import KIT_DIR

CONNECT = f"{KIT_DIR}/connect.yml"
NOTIFY_FLOW = ".github/workflows/agentic-notify.yml"
AGENT_FLOW = ".github/workflows/agent.yml"

CONFIG = """schema: agentic-connect/1
sources:
  - {id: backlog, platform: jira, base_url: "https://example.atlassian.net", query: "project = DEMO AND labels = spec-ready",
     auth: {user_env: JIRA_USER, token_env: JIRA_TOKEN}}
  - {id: boards, platform: ado, organization: example, project: Demo,
     wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'spec-ready'", auth: {token_env: ADO_TOKEN}}
  - {id: tasks, platform: clickup, list: "901", auth: {token_env: CLICKUP_TOKEN}}
  - {id: issues, platform: github, repo: example/demo, labels: [spec-ready], auth: {token_env: TRACKER_GITHUB_TOKEN}}
  - {id: inbox, platform: document, paths: ["requirements/inbox/*"]}
notify:
  channels:
    - {id: chat, type: slack, webhook_env: SLACK_WEBHOOK_URL}
    - {id: teams, type: teams, webhook_env: TEAMS_WEBHOOK_URL}
    - {id: mail, type: email, smtp: {host_env: SMTP_HOST, port: 587, user_env: SMTP_USER, password_env: SMTP_PASSWORD, from: kit@example.com}, to: [team@example.com]}
    - {id: origin, type: work-item}
  routes:
    - {events: [gate-ready, gate-approved, gate-rejected, released], channels: [chat, origin]}
    - {events: [check-failed, deadline, source-changed, duplicate-candidate, intake-new], channels: [teams, mail]}
  templates:
    gate-ready: "Gate {gate} of {spec} needs {roles}"
  links: {repository: "https://github.com/example/demo", branch: main}
"""
NOTIFY = """name: agentic-notify
on:
  workflow_run:
    workflows: [agentic-checks]
    types: [completed]
jobs:
  notify:
    runs-on: ubuntu-latest
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
      JIRA_USER: ${{ secrets.JIRA_USER }}
      JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
    steps:
      - run: python trusted/.specify/extensions/agentic/scripts/agentic.py --root head connect run --base-ref origin/main --notify
"""
AGENT = """name: agent
on:
  workflow_dispatch:
jobs:
  implement:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "Implement the next ready task"
"""


def extend_sample(root: Path) -> None:
    selftest._write(root, CONNECT, CONFIG)
    selftest._write(root, NOTIFY_FLOW, NOTIFY)
    selftest._write(root, AGENT_FLOW, AGENT)


def fixtures() -> dict:
    E = selftest._edit
    return {
        "CK-CONNECT-CONFIG": ("a webhook address is stored in connect.yml",
                              E(CONNECT, "webhook_env: SLACK_WEBHOOK_URL", 'webhook: "https://hooks.slack.com/' + 'services/T0000000/B0000000/' + 'abcdefghijklmnop"'), {}, {}),
        "CK-NOTIFY-CONTENT": ("a notification template tries to include a requirement's text",
                              E(CONNECT, '"Gate {gate} of {spec} needs {roles}"', '"Gate {gate} of {spec}: {body}"'), {}, {}),
        "CK-PIPELINE-SECRETS": ("the job that runs an agent can read the Slack webhook",
                                E(AGENT_FLOW, "    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    env:\n      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}\n"),
                                {}, {}),
    }
