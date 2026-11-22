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

## State

No gate has been passed by a pull-request review, so the kit holds no decision record. What the owner approved in conversation is written at the top of each document, in his words, and is marked there as not being a decision record.

Spec Kit and the kit's extensions are **not installed** in this repository, and no workflow runs the checks. To run them from a checkout of agentic-spec-kit:

```bash
python <agentic-spec-kit>/extensions/agentic/scripts/agentic.py --root . check
```

Until agents have a GitHub identity of their own, an approval under the maintainer's account cannot be told from one made by an agent, and GitHub does not let the author of a pull request approve it.
