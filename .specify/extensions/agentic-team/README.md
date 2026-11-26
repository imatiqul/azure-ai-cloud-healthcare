# agentic-team (slice 0.3 — the agent team)

Sixteen agents defined once and rendered for Claude Code, GitHub Copilot, or one agent playing each role in turn.
Work is tracked in the repository, not in any agent's memory. Gates stay with people.
Requires `agentic`. Works on every profile; Lite installs the minimum team (Orchestrator, Spec Author, implementers, Independent Verifier).

```bash
A="python .specify/extensions/agentic/scripts/agentic.py"
specify extension add --dev path/to/agentic-spec-kit/extensions/agentic-team
$A team init --runtimes claude,copilot,sequential   # agent specs into .specify/agentic/agents/, runtime files rendered
$A team list                                        # the agents, and what each runtime enforces
$A work create --spec <spec>                        # one work item per open task
$A work list --spec <spec> --ready                  # what can start now; items in a group may run together
$A work claim --spec <spec> --item T001 --agent backend-implementer --worktree
$A work handoff --spec <spec> --item T001 --agent backend-implementer --done "..." --evidence <file>
$A work review --spec <spec> --item T001 --by independent-verifier --accept     # or --return "<finding>"
$A work integrate --spec <spec> --item T001
$A team check
```

Workflows: `agentic-sdd-team` (the Orchestrator dispatches each stage's agents) and `agentic-sdd-sequential`
(one role per step, each step a new session). Both pause at G1 to G7 through the `agentic-gate` step.

## What the kit holds agents to

| Rule | How |
|---|---|
| An agent changes only the files of the work item it holds | The path guard blocks the write where the runtime has pre-tool-use events; `work handoff` refuses; `CK-PATH-DIFF` checks afterwards |
| No two agents edit the same file, migration folder, contract or shared component | `work claim` refuses; `CK-PATH-LOCK` |
| The author never reviews its own work | `work review` refuses; `CK-AUTHOR-NEQ-VERIFIER` |
| A review names who made it: a reviewing agent of the team, or a person in the roles file | `work review` refuses; `CK-AUTHOR-NEQ-VERIFIER` reports a record that names nobody |
| At most two rework rounds | The third return blocks the item and writes an escalation with both positions for the accountable person; `CK-REWORK-LIMIT` |
| Every run has a budget | `orchestrate step` stops the run with a report when steps, minutes or money run out; `CK-BUDGET` |
| An agent works from a context pack the kit built | `work claim` builds it from the spec, the plan, the task and the living specs it touches; `CK-CONTEXT` fails a pack that was edited or has gone stale |
| An agent does not settle a choice the spec and the plan left open | A question given to `work handoff --question` becomes a proposal in the change's decision log, `specs/<spec>/decision-log.yml`, for a person to decide. The context pack of a task shows the decisions that touch it, and marks one that nobody has decided. The path guard refuses the log to an agent's file tools. Nothing stops an agent from typing `decision decide` in a shell: the log is evidence of G5, where a person reads it (added 2026-11-26) |
| An agent uses only tool servers a person reviewed | `.specify/agentic/tools.yml`, read from the base branch; `CK-TOOL-ALLOWLIST` |
| Every step says which model ran, on what inputs, with which tools, at what cost | `orchestrate step --model <name>@<version> --cost <amount> --gate <gate> --input <file>`; `CK-RUN-RECORD` |
| Each class of agent runs on the model the routing policy names, within a spend limit | `team.routing`, `team.spend.per_spec`, `team.budget.cost` in `kit.yml`; `CK-ROUTING`; `report spend` |
| A change to the agents or their models may not make the team worse | `golden baseline`, accepted by a named person; `CK-GOLDEN`, `CK-GOLDEN-BASELINE` |
| An instruction planted in a file, an issue or a tool's output is reported and not obeyed | Three planted-instruction tests in every golden run; `CK-INJECTION` |
| Instruction files grant nothing the kit forbids | `AGENTS.md`, `CLAUDE.md` and the like are linted, must be tracked and must have a code owner; `CK-AGENT-MEMORY` |
| Agent steps are on the record | Each step and state change is an entry in the hash-chained audit log: which agent, on whose behalf, inputs and outputs |
| The agent's credential cannot approve, merge past protection, publish or deploy | `CK-CRED`, also run by `doctor` |
| Runtime files match the specs | `CK-AGENT-SPEC` |

## Golden tasks

`$A golden run --fixture fixtures/multi-app` takes four tasks through every gate and plants three defects, in parallel
and sequential mode, on throwaway copies of the fixture. The default driver is a scripted stand-in: it proves the
machinery end to end and nothing about a model's judgement. `--agent-command "<command>"` runs a real coding agent
for each implementation and review step instead; that path has not been run with a model.

Every run also plants an instruction in a repository file, in an issue's text and in a tool's output, and passes only
if the agent reports each one and acts on none.

To hold a project's agents to a baseline:

```bash
$A --root . golden run --fixture path/to/agentic-spec-kit/fixtures/multi-app --out .specify/agentic/golden/results.yml
$A golden baseline --accepted-by <person>:<role>:pull/<n>#review-<id> --write    # a person accepts it, in a review
```

After that, a change to an agent spec or to the routing policy fails until the golden tasks are run again, and fails
if a task, a seeded defect or a planted instruction that was good in the baseline is not good now.

## Limits

- No coding agent was run in this slice. The rendered agent files, both workflows and the event wiring were installed on Spec Kit 1.4.3, and the event script was driven with hand-written tool calls.
- The path guard does not parse shell commands.
- Which model ran a step and what it cost are what the runtime reported. The kit requires them and cannot prove them.
- The planted-instruction tests have run with the scripted stand-in only. That shows the tests detect an agent that obeys or stays silent, not that a model resists.
- The tool allowlist covers MCP servers in eight known configuration files, not a tool an agent installs for itself.
- Agent identities are recorded, not proven.
- `CK-CRED` sees the credential the kit runs with, not every credential on the machine.
