# agentic-connect

Connections for agentic-spec-kit (slice 0.6). Needs `agentic` and `agentic-product`.

| Direction | What | Where |
|---|---|---|
| In | Requirements become intake records. For an item of Jira, Azure DevOps or GitHub the record also gets a count and a hash of the item's comments, and none of their text | Azure DevOps, Jira, ClickUp, GitHub Issues and Projects, documents (Markdown, text, HTML, CSV, JSON) |
| Run | Checks, events and review mirroring, with no prompt | GitHub Actions, Azure Pipelines, GitLab CI; any system that can run one command |
| Out | People are told | Slack, Teams, email, a note on the originating work item |

## Three rules the extension enforces

1. **A notification is not an approval.** Gates are passed by pull-request reviews. Nothing sent or received here changes a gate.
2. **A notification carries identifiers, a status and a link.** Templates may use `{spec}`, `{gate}`, `{roles}`, `{count}`, `{ids}`, `{status}`, `{decision}` and nothing else (CK-NOTIFY-CONTENT). Requirement text does not leave the repository this way.
3. **Secrets are named, never stored, and never visible to an agent.** `connect.yml` holds variable names. CK-CONNECT-CONFIG and CK-PIPELINE-SECRETS fail a stored secret, a pipeline that exposes secrets to pull-request code, and an agent step that can read a tracker or notification credential.

`connect.yml` is read from the base branch when the pipeline runs, so a change cannot redirect a token to a new address.

## Commands

```
agentic.py connect init --write          # write connect.yml with every option commented out
agentic.py connect check                 # CK-CONNECT-CONFIG, CK-NOTIFY-CONTENT, CK-PIPELINE-SECRETS
agentic.py connect fetch [--source id]   # pipeline: fetch requirements into .specify/agentic/intake/, with a digest of each item's comments
agentic.py connect run --base-ref <ref>  # pipeline: every check, a summary, the check result as exit code
agentic.py connect notify --base-ref <ref> --ledger <file>   # pipeline: tell people what changed
agentic.py connect mirror --change pull/<n> --commit <sha> [--write]   # pipeline: reviews to decision records
agentic.py connect events                # what would be announced now
```

## Not verified

No adapter in this extension has been run against the live service. Each is tested against recorded responses that follow the vendor's published API. `docs/adapters/trackers.md` lists every endpoint and when it was read. The three pipeline files have not been run by their CI systems.

Gate approvals are read from GitHub pull-request reviews only. The kit runs in Azure Pipelines and GitLab CI, but approvals made in Azure Repos or GitLab merge requests are not read yet.
