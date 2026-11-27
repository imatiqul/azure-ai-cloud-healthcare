# Spec-driven governance for HealthQ Copilot

- **Phase and date:** Phase 7, 2026-11-22. The numbers below are counted from the files beside this one when it is written
- **Upstream and reference:** github/spec-kit `v1.4.3`; this repository
- **Requirement IDs exercised:** GOV-9, GOV-11, MAP-1 to MAP-5, MAP-8, TRC-1, AGT-1 to AGT-3
- **Assumptions:** owners, tiers and classifications in the system map are proposals until a plan is reviewed
- **Unverified:** nothing here is enforced by this repository's pipeline yet

These files were written with [agentic-spec-kit](https://github.com/imatiqul/agentic-spec-kit). Agents draft, build and verify; a named person approves at every gate.

| Path | What it is |
|---|---|
| `.specify/memory/constitution.md` | The constitution: 25 principles, each checked by a machine or judged by a named role |
| `.specify/agentic/` | Kit settings (Regulated profile, HIPAA pack), who holds which role, what checks each principle, the audit log |
| `.specify/agentic/agents/` | 16 agent specs: what each agent may read, write and run, and what it never does |
| `system-map/map.yml` | What exists and what depends on what: 100 components and 206 dependencies |
| `specs/` | 25 specs, one per finding of the review. 6 have a plan; 5 have a task list |
| `.specify/agentic/work/`, `.specify/agentic/runs/` | What agents did, task by task and step by step, for: `004-audit-identity` |
| `.specify/extensions/` | The kit's own code: 7 extensions, as the kit's installer copied them, last on 2026-11-27. It is not edited here: a change to the kit is made in agentic-spec-kit and installed again |
| `.specify/agentic/connect.yml` | Where requirements come from: this repository's issues with the label `kit-live-test`, and one GitHub Project |
| `.specify/agentic/intake/` | Requirements as they arrived from there, one record each: 1 since 2026-11-27. A record is a request, not a decision; a Product Owner triages it |
| `.github/workflows/agentic-*.yml` | 3 workflows: the kit's checks on every pull request, the intake of requirements, and one that opens a pull request as the workflow's own account |

## State

No gate has been passed by a pull-request review, so the kit holds no decision record. What the owner approved in conversation is written at the top of each document, in his words, and is marked there as not being a decision record.

Since 2026-11-26 the kit's code is in this repository, for its pipeline. The 7 extensions are a copy of agentic-spec-kit at commit `ce58712`, made on 2026-11-27 by that repository's `scripts/install.sh` with the Regulated profile and the HIPAA pack. The first copy, a day earlier, was of `43f672e`; what changed between the two is in that repository's `docs/release-notes.md`. To run the checks from a checkout of this repository, with Python 3.10 or later and PyYAML:

```bash
python .specify/extensions/agentic/scripts/agentic.py check
```

Two things are not here, and each is a later step:

- **Spec Kit itself was never set up in this repository** (`specify init`). So no coding agent has the kit's commands, and the check `CK-UPSTREAM-PIN` cannot run.
- **The kit's preset, its gate step and its three Spec Kit workflows are left out.** The installer writes them as well; nothing here can run them without that setup.

The three `agentic-` workflows first ran on 2026-11-27. GitHub Actions had been off for this repository since May 2026; it was switched on again on 2026-11-26, with each of the 35 older workflows disabled on its own, so that only those three can run. `agentic-checks` ends red on `main` and on every pull request it runs on, because checks fail on this repository's own files: 21 of 106 when it first ran, with 2 more that could not run. No rule of this repository requires it, so it holds nothing.

Until agents have a GitHub identity of their own, an approval under the maintainer's account cannot be told from one made by an agent. GitHub does not let the author of a pull request approve it. The workflow `agentic-open-pull-request` opens a pull request as the workflow's own account, so that the maintainer may review a change he pushed; each such approval is recorded as a single-approver exception.
