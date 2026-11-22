# Plan: the clinical evaluation runs the production classifier (006, finding C6)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, QLT-3, QLT-7 to QLT-9, QLT-13 to QLT-16, CHG-19
- **Assumptions:** P1 to P4 under "Decisions this plan makes". The condition the owner set for a clinician at G2 (A1) is still open
- **Unverified:** written from reading the code. Nothing was built or run

## What the code does today

There are two things called an evaluation, and neither runs the classifier.

| | The harness | The pipeline gate |
|---|---|---|
| Where | `tests/HealthQCopilot.Tests.Eval/ClinicalAccuracyHarnessTests.cs` | `tests/HealthQCopilot.Tests.Unit/Agents/AgentEvalCiGateTests.cs`, run by `.github/workflows/agent-eval.yml` |
| Golden set | 5 cases with an expected level, `tests/HealthQCopilot.Tests.Eval/GoldenSets/triage.json` | 3 cases with expected phrases, `src/HealthQCopilot.Agents/Evaluation/golden-sets/triage.json` |
| How a case is scored | It passes if the input contains one of its own expected keywords or its expected level, and any P3 case passes (lines 41-46) | A stub answers with the case's own expected phrase (lines 14-29, 46-47) |
| What it reports | At least 80 percent | 100 percent, and fails on a drop of more than 2 points |
| Run by a workflow | No | Yes, when agent code changes. No workflow has run since May 2026 |

The classifier, `TriagePlugin.ClassifyUrgency`, is named in neither.

## The change

1. **One harness, which calls the classifier.** For each case it calls `ClassifyUrgency` on the production assembly with the case's input and compares the level it returns with the case's label (FR-001, FR-002). It has no keyword of its own and no stand-in (FR-008).
2. **One golden set**, the one with expected levels, versioned, with the clinician who signed that version recorded in the file. The harness refuses a version with no signature (FR-004, AC-005). The other set stays with the evaluator of free-text answers, under its own name.
3. **The set grows to what its plan says** (FR-003): every level, denied symptoms, input that matches no rule. The numbers are a clinician's (A1).
4. **A result file** with the classifier's version, the set's version, each measure and the hash of the classifier's source, which is what the kit's production-path check binds (NFR-002).
5. **The pipeline job** runs the harness when the classifier, its rules, its prompts or the golden set change, fails below a threshold, and fails below the last result recorded on the default branch (FR-005 to FR-007).
6. **The stub gate is removed**, with its baseline of 1.0 (AC-009).

## Decisions this plan makes
- P1: the harness stays in the evaluation test project and that project is added to the workflow. Today no workflow runs it.
- P2: the measures are recall for P1, the rate of cases given a lower level than their label, and accuracy by level. The thresholds are in `ai-eval.yml`; only the first is settled, by the spec.
- P3: the first true run will fail. Applying the rules as written to the five existing cases gives two of five. That failure is the finding, made visible; it is cleared by 005, not by lowering a threshold.
- P4: the result on the default branch is a file in the repository, so that "the last release" (A2) is something the pipeline can read.

## Requirements, criteria, tasks

| Requirement | Criterion | Proven by | Task |
|---|---|---|---|
| FR-001 | AC-001 | The kit's production-path check on the harness and the result file | T002, T006 |
| FR-002 | AC-002, AC-003 | Harness tests with two wrong classifiers: one that always answers P3, one that returns the wrong level for a case whose input holds its own keywords | T002, T003 |
| FR-003 | AC-004 | A test that counts the set by label and by kind against the plan in `ai-eval.yml` | T004 |
| FR-004 | AC-005 | A harness test with a set whose version has no signature | T002, T003 |
| FR-005 | AC-006 | The workflow's path filters, and a run on a change to one rule | T005 |
| FR-006 | AC-007 | A run with a threshold set above the result | T005 |
| FR-007 | AC-008 | A run with a recorded result set above the result | T005 |
| FR-008 | AC-009 | A search of the evaluation and gate code for a type that returns the expected answer | T003, T006 |

## Risks the plan carries
- **The gate goes red and stays red until 005.** A red gate that everyone learns to ignore is worse than none. The rollout below runs it on the default branch, as a report, before it blocks pull requests.
- **No clinician is on the project.** Without one the set cannot be signed, the harness will refuse it, and that is the designed behaviour.
- **The harness needs the agent project's assembly, which needs the solution's packages.** That is true of the existing tests too.

## Found while planning, and not part of this change
1. The evaluator of free-text answers (`ClinicalEvaluator`) is exercised in the pipeline only through the stub. Whether it has ever run against a model is not visible in the repository.
2. `agent-eval.yml` watches paths under `src/HealthQCopilot.Infrastructure/AI/`. The classifier is not there, and the golden set of the test project is in no path filter.

## For the reviewer at G3
- A clinician has to set the numbers of cases and the thresholds (A1) and sign the set. Nobody in `roles.yml` is a clinician, so the kit's evaluation and safety-case checks fail for this spec until one is.
- Which of the two sets is the golden set? The plan says the one with expected levels.
