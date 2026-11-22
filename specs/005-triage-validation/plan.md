# Plan: triage is validated, and a clinician decides (005, finding C5; covers N5)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3. It cannot pass G3 as it stands: see "For the reviewer at G3"
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, QLT-3, QLT-6 to QLT-9, QLT-13 to QLT-17, CHG-18, CHG-19
- **Assumptions:** P1 to P4 under "Decisions this plan makes". The three conditions the owner set for a clinician at G2 (A1 to A3) are still open
- **Unverified:** written from reading the code. Nothing was built or run. The figures under "What the rules do to the golden cases" come from applying the rules as written, by script, to the five inputs; the production code was not executed

## What the code does today

- **The classifier is three keyword lists and a default.** `ClassifyUrgency` looks for any of 8 phrases for P1, 7 for P2 and 7 for P3, and answers P4 otherwise (`src/HealthQCopilot.Agents/Plugins/TriagePlugin.cs:15-39`). There is no handling of a denied symptom.
- **Its input is the transcript with the retrieved text appended** (`src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs:148-158`). A phrase in a retrieved protocol counts as the patient's.
- **Only P1 and P2 wait for a clinician.** `TriageWorkflow.AssignLevel` sets P1 and P2 to "awaiting human review"; P3 and P4 are completed at once and announced as `triage.completed` (`src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs:96-120`). The scheduling, population health and revenue services subscribe to that event and act on it.
- **So the default is the dangerous path:** input that matches nothing becomes P4, is completed with no review, and is acted on.

### What the rules do to the golden cases
Applying the rules as written to the five cases in `tests/HealthQCopilot.Tests.Eval/GoldenSets/triage.json`: two of five get the expected level. The two P1 cases are right. The P2 case, a confirmed appendicitis, comes out as P4, as do both P3 cases. "Denies chest pain, has a mild cough" comes out as P1. The harness in that folder reports these cases as passing, and the pipeline gate reports 100 percent; that is finding C6 and spec 006.

## The change

1. **The classifier sees the transcript and nothing else** (FR-003). Retrieved text goes to the explanation shown to the clinician. Retrieved text that contains an instruction is reported and not shown as guidance (AC-004).
2. **Rules become data that a clinician can read and sign:** one versioned file of rules, each with its phrases, the words that negate them, and its level. The classifier's version is the file's version (QLT-13, NFR-001). A denied symptom does not fire its rule (FR-004).
3. **Input that fires no rule is "unclassified"**, never P4 (FR-005). The workflow holds no level for it and it goes to the clinician's queue.
4. **Every proposal waits for a clinician** (FR-006), with the rule and the phrases that produced it. `triage.completed` is published when the clinician confirms, not before, so no subscriber acts on a proposal.
5. **Each classification records** the rule file's version, the rule that fired and the clinician's decision (NFR-001).

## Decisions this plan makes
- P1: "unclassified" is stored as a workflow that awaits review with no level and the reason code `UNCLASSIFIED`. The workflow's level is already optional in the model, so the plan expects no schema change and no data-change plan; the first task confirms that against the migrations. If the clinician's answer to A3 requires a stored level of its own, that changes, and a data-change plan for `agent-db` follows.
- P2: the model is used, as today, to narrate; it does not classify. So the evaluation needs no model, and runs in the pipeline.
- P3: nothing is released before 006 has replaced the harness. The first true evaluation is expected to fail three of the five existing cases.
- P4: a proposal that is higher than the patient's current level goes to the top of the clinician's queue and alerts the clinician on call. It does not change the level by itself. See the first item under "For the reviewer at G3".

## Requirements, criteria, tasks

| Requirement | Criterion | Proven by | Task |
|---|---|---|---|
| FR-001 | AC-001 | The evaluation of 006 on the signed golden set: no P1 case lower | T002, T007 |
| FR-002 | AC-002 | The pipeline's evaluation job against the thresholds in `ai-eval.yml` | T007 |
| FR-003 | AC-003, AC-004 | Unit tests of the orchestrator: the same transcript with and without retrieved text; retrieved text carrying an instruction | T003, T004 |
| FR-004 | AC-005 | Unit tests of the rules: each P1 phrase, denied | T002, T004 |
| FR-005 | AC-006 | Unit test of the workflow: no rule fires, no level, reason `UNCLASSIFIED`, in the queue | T005, T006 |
| FR-006 | AC-007 | Integration test: a proposal is returned with its rule and phrases and can be confirmed or changed | T005, T006 |
| FR-007 | AC-008 | Unit test of the workflow: a patient at P2, a proposal of P4, nothing changes until confirmed | T005, T006 |

## Risks the plan carries
- **Every triage now needs a clinician's action.** Today only P1 and P2 do. The queue grows by every P3 and P4, and nothing downstream happens until someone confirms. Whether the service can staff that is not an engineering question.
- **Negation in clinical language is not solved by a list of words.** "No chest pain since yesterday" and "chest pain, no relief" both contain "no". The rules file and its golden cases need a clinician; the plan provides the mechanism and the tests, not the medicine.
- **Subscribers get their event later.** Scheduling, population health and revenue act on `triage.completed`. They will act after confirmation. Anything that assumed an immediate event waits.
- **The change reaches further than the spec says.** See the second item under "For the reviewer at G3".

## Found while planning, and not part of this change
1. The usage tracker takes the tenant for cost reports from a request header (`TriageOrchestrator.cs:162`). That is spec 003.
2. Two golden sets exist with different shapes: five cases with expected levels in the test project, and three cases with expected phrases in the agent service (`src/HealthQCopilot.Agents/Evaluation/golden-sets/triage.json`). Spec 006 has to say which one is the golden set.

## For the reviewer at G3
- **The spec and the constitution disagree, and G3 cannot settle it.** The spec's FR-007 and its condition A1 let a proposal that raises a patient's priority take effect at once. The constitution's P-12 says no triage level takes effect without a clinician's action. An automated review of pull request 72 pointed this out, and it is right. P4 above is a design that satisfies both as written: a higher proposal changes who looks first, not the level. The alternative is to amend P-12 so that an increase applies at once and stays until a clinician confirms or changes it. That is a clinical decision and an amendment at G0. The plan must not go further until one of the two is chosen.
- **The spec's `touches` is incomplete.** The rule that only P1 and P2 wait for a clinician is in the domain library (`TriageWorkflow.cs`), which the spec does not declare. Adding `lib-domain` is an amendment, and it brings every service that builds with that library into the blast radius.
- **A clinician has to answer A1 to A3, sign the golden set and accept the safety case.** No person in `roles.yml` is a clinician. Until one is, the kit's evaluation and safety-case checks fail for this spec, and they should.
