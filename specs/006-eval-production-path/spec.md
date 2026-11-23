---
spec: 006-eval-production-path
finding: C6
tier_declared: critical
owner_role: ai-engineer
principles: [P-11]
touches: [ai-eval-golden-set]
changes_existing_code: true
depends_on:
  nodes: [ai-triage-classifier]
  specs: []
---
# Feature Specification: The clinical evaluation runs the production classifier

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; later QLT-14, QLT-15
- **Assumptions:** recorded under "Decided at G2". A1 is a condition for a clinician at G3
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
C6, confirmed in Phase 1 and worse than first stated. The harness scores a case by checking whether the input contains its own expected keywords, and P3 cases pass by default. The golden set has 5 cases. No workflow runs that test project. The CI gate that does run uses a stub that echoes the expected phrase, against a baseline of 1.0. The evaluation code never refers to the classifier.
Evidence: `tests/HealthQCopilot.Tests.Eval/ClinicalAccuracyHarnessTests.cs:41-46`; `tests/HealthQCopilot.Tests.Unit/Agents/AgentEvalCiGateTests.cs:14-29`.

## User Stories
- As a clinical safety officer, I want the evaluation to exercise the code that triages patients, so that a passing result says something about patients.
- As an AI engineer, I want a change to the classifier to be scored before it merges, so that I learn of a regression from the pipeline and not from a clinic.

## Requirements
- **FR-001**: The evaluation harness MUST obtain every triage level it scores by calling the production classifier.
- **FR-002**: The harness MUST score a case by comparing the classifier's output with the clinician's label for that case.
- **FR-003**: The golden set MUST contain cases for every triage level, for denied symptoms and for input that matches no rule, in the numbers its evaluation plan states.
- **FR-004**: Each version of the golden set MUST record the clinician who signed it.
- **FR-005**: The pipeline MUST run the evaluation on every change to the classifier, its rules, its prompts or the golden set.
- **FR-006**: The pipeline MUST fail when a result is below a threshold in the evaluation plan.
- **FR-007**: The pipeline MUST fail when a result is below the result of the last release.
- **FR-008**: The evaluation code MUST contain no stand-in for the classifier.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the harness, When the kit's production-path check inspects it, Then every scored value traces to a call into the classifier's production assembly.
- **AC-002** (verifies FR-002) (abuse case): Given a classifier that answers P3 for every input, When the evaluation runs, Then it fails.
- **AC-003** (verifies FR-002) (abuse case): Given a case whose input contains its own expected keywords and a classifier that returns the wrong level, When the case is scored, Then it is scored as wrong.
- **AC-004** (verifies FR-003): Given the golden set and its evaluation plan, When the set is counted by label and by kind, Then each count meets the plan.
- **AC-005** (verifies FR-004): Given a version of the golden set with no recorded clinician, When the pipeline runs, Then it fails.
- **AC-006** (verifies FR-005): Given a change to a triage rule, When the pull request's checks run, Then the evaluation is among them.
- **AC-007** (verifies FR-006): Given a classifier version that misses a threshold, When the pipeline runs, Then the evaluation job fails and names the threshold.
- **AC-008** (verifies FR-007): Given a classifier version that scores lower than the last release on any measure, When the pipeline runs, Then the evaluation job fails and names the measure.
- **AC-009** (verifies FR-008): Given the evaluation and CI-gate code, When it is searched for a type that returns the expected answer, Then none is found.

## Non-Functional Requirements
- **NFR-001**: The golden set is synthetic. No case is taken from a real patient.
- **NFR-002**: The evaluation's result file records the classifier version, the golden set version and each measure, so that the kit can bind it to the change.

## Risks
- The first real run will very likely fail: the current rules have never been scored. That is a finding about the classifier (005), not a reason to weaken the evaluation.
- Five cases prove nothing. Building a set with a clinician takes their time, and until it exists FR-003 cannot be met.

## Out of Scope
- Changing the classifier (005). Accuracy figures shown in the product (H4).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (condition, for a clinician at G3): the numbers of cases, the measures and the thresholds are set in the evaluation plan by a named clinician, not here.
- A2 (accepted): "the last release" is the last result recorded on the default branch.

## PHI Involved
None. The golden set is synthetic (NFR-001).

## Access Control
Not applicable: the evaluation reads no patient data.

## Audit Controls
Each evaluation result is kept with the versions it was run on (NFR-002).

## Integrity
A signed golden set cannot change without a new version and a new signature (FR-004).

## Authentication
Not applicable: no user identity is involved in the evaluation.

## Transmission Security
Not applicable: the evaluation runs in the pipeline on synthetic data.

## Minimum Necessary
Not applicable: no PHI is used.
