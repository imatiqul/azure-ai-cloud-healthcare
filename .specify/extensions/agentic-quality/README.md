# agentic-quality

Quality packs for agentic-spec-kit (slice 0.4). Needs `agentic` and `agentic-system`.

A pack switches on from facts, not from a setting: the spec's tier and the system-map nodes it touches. A low-tier change to one service is asked for a threat model and a test strategy. A critical change to a model is asked for an evaluation that runs the production code, and a safety case a named person accepted.

| Pack | Checks |
|---|---|
| Security and privacy | CK-THREAT-MODEL, CK-SECURITY-EVIDENCE, CK-PRIVACY-IMPACT |
| Test depth | CK-TEST-STRATEGY, CK-CHARACTERIZATION, CK-TEST-DATA, CK-A11Y |
| AI systems | CK-AI-VERSION, CK-AI-EVAL, CK-AI-PROD-PATH, CK-AI-SAFETY-CASE, CK-AI-RETRIEVAL, CK-AI-RUNTIME, CK-METRIC-PROVENANCE |
| Release and operability | CK-INFRA-CHANGE, CK-ENV-PARITY, CK-PROGRESSIVE, CK-FLAG, CK-POST-RELEASE, CK-OPS-READINESS |
| Feedback | CK-ADR, CK-INCIDENT-LOOP |

Commands:

```
python .specify/extensions/agentic/scripts/agentic.py quality plan --spec <spec> [--write]
python .specify/extensions/agentic/scripts/agentic.py quality check
python .specify/extensions/agentic/scripts/agentic.py quality debt
```

What the checks do not do: they do not run a scanner, an evaluation or an accessibility tool. They require the record that one ran, bound to the files it ran on, and they fail when that record is missing, stale or says "fail".
