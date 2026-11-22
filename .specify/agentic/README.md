# Spec-driven governance for HealthQ Copilot

- **Phase and date:** Phase 5, 2026-11-22
- **Upstream and reference:** github/spec-kit `v1.4.3`; this repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, GOV-11, MAP-1 to MAP-5, MAP-8, TRC-1
- **Assumptions:** owners, tiers and classifications in the system map are proposals until a plan is reviewed
- **Unverified:** nothing here is enforced by this repository's pipeline yet

These files were written with [agentic-spec-kit](https://github.com/imatiqul/agentic-spec-kit). Agents draft, build and verify; a named person approves at every gate.

| Path | What it is |
|---|---|
| `.specify/memory/constitution.md` | The constitution, version 1.0.0: 25 principles, each checked by a machine or judged by a named role |
| `.specify/agentic/` | Kit settings (Regulated profile, HIPAA pack), who holds which role, what checks each principle, the audit log |
| `system-map/map.yml` | What exists and what depends on what: 77 components and 168 dependencies |
| `specs/` | One spec per finding of the review. The first eight are the Critical ones |

## State on 2026-11-22

The owner approved the constitution (gate G0) and the first eight specs (gates G1 and G2) in conversation. No gate has yet been passed by a pull-request review, so the kit holds no decision record for them.

Spec Kit and the kit's extensions are **not installed** in this repository, and no workflow runs the checks. To run them from a checkout of agentic-spec-kit:

```bash
python <agentic-spec-kit>/extensions/agentic/scripts/agentic.py --root . check
```

Until agents have a GitHub identity of their own, an approval under the maintainer's account cannot be told from one made by an agent, and GitHub does not let the author of a pull request approve it.
