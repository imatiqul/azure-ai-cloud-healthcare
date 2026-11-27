# agentic (slice 0.1 — Govern)

Human approval gates bound to identity and evidence, waivers, traceability and an audit log,
enforced by deterministic checks. Installs on unmodified Spec Kit 1.4.3.

```bash
specify extension add --dev path/to/agentic-spec-kit/extensions/agentic
python .specify/extensions/agentic/scripts/agentic.py init --profile standard --repository owner/name
python .specify/extensions/agentic/scripts/agentic.py doctor
python .specify/extensions/agentic/scripts/agentic.py check
```

Requires Python 3.10 or later and PyYAML (3.11 or later to read a Codex `.codex/config.toml`). See `docs/install.md` and `docs/admin-setup.md` in the repository.

Run `python .specify/extensions/agentic/scripts/agentic.py selftest` to see every check fail on its broken fixture. Run `python .specify/extensions/agentic/scripts/agentic.py demo` to watch one gate close and open again in a throwaway project, where a file plays GitHub and proves nothing about who approved.

In a coding agent, start with `/speckit.agentic.guide`. It says where a change stands, what is needed next and from whom, and which command to run.

## Added in slice 0.4

```bash
A="python .specify/extensions/agentic/scripts/agentic.py"
$A lane --spec <spec>                         # which lane the spec is on, and why; nobody chooses it
$A brief --spec <spec> --gate G3 --write      # the reviewer's one page; also starts the clock for time-to-decision
$A report list                                # gates, waivers, trace, metrics, and whatever the other extensions add
$A report gates                               # who is needed next
$A report all --out reports --html            # every view as files, and one page
$A audit-pack --spec <spec> --write           # the evidence pack a release is approved with (Regulated)
$A audit-pack --from 2026-10-01 --to 2026-12-31 --out pack   # every release in a range, as files with hashes
```

The evidence pack supports an audit. It does not certify compliance with any law, regulation or standard, and it says so on its first line.

## Added on 2026-11-26 (Phase 12)

```bash
$A changeset --spec <spec>                    # one page for a change: origin, gates, versions, tasks, branches and pull requests, what is open
$A changeset --spec <spec> --write            # keeps it as specs/<spec>/changeset.md, which is never gate evidence
$A report changesets                          # one line for each change
$A decision add --spec <spec> --title "<the question>"       # a question for the change's decision log
$A decision decide --spec <spec> --id D-001 --outcome "<what was decided>" --owner <person>
$A decision list --spec <spec>                # what was decided inside the change, and what is still open
$A search "<text>" --spec <spec>              # text in the files git tracks; each hit names its map node, a spec's nodes first
$A init --profile <profile> --open-pr-workflow   # also writes a workflow that opens a pull request as the workflow's own account
```

The page of a change shows what is recorded and decides nothing. The decision log is part of the evidence of G5: the kit cannot tell who typed a decision, so the person who approves the implementation approves the decisions in the log. The workflow is for the person who pushes a branch and also approves its gate; its header says what the repository setting it needs also allows. The specs are `docs/design/changeset.md`, `decision-log.md`, `search.md` and `pull-request-by-workflow.md` in the kit's repository.
