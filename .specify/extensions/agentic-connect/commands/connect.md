---
description: "Set up connections to trackers and notification channels, and install the pipeline for this repository's CI system."
---

## User Input

```text
$ARGUMENTS
```

## Steps

1. Run `python .specify/extensions/agentic/scripts/agentic.py connect init --write`. It writes `.specify/agentic/connect.yml` with every option commented out.
2. Ask the user which trackers hold their requirements and where people should be told. Uncomment and fill only those entries.
   - For each secret, write the NAME of the variable (`token_env: JIRA_TOKEN`). Never ask the user for a secret's value, and never write one into a file.
   - A query (JQL, WIQL, a label) should select only items that are ready to be specified. Ask the user for it; do not guess.
3. Copy the pipeline template for the user's CI system from `.specify/extensions/agentic-connect/ci/` and delete the secret names they do not use:
   - GitHub Actions: `github-actions.yml` to `.github/workflows/agentic-connect.yml`
   - Azure Pipelines: `azure-pipelines.yml`
   - GitLab CI: `gitlab-ci.yml` (replace the image digest with one the user has reviewed)
4. Tell the user what they must do themselves, in the CI system's settings: create each named secret, and restrict it as the template's header says.
5. Run `python .specify/extensions/agentic/scripts/agentic.py connect check` and report every failure as it is.
6. Show the user what would be announced now: `python .specify/extensions/agentic/scripts/agentic.py connect events`.

## Rules for the agent

- You never run `connect fetch`, `connect notify` or `connect mirror`. They run in the pipeline, which holds the secrets. You have none and must not be given any.
- You never put a secret, a webhook address or a token in a file, a command or a message.
- You do not add an agent step to a job that has tracker or notification secrets in scope. CK-PIPELINE-SECRETS fails it.
- A message in Slack or Teams, a comment on a work item and an email are not approvals. If the user says someone approved a gate in chat, tell them the approval has to be a pull-request review carrying the gate's line.
