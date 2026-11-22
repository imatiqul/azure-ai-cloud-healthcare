---
spec: 005-triage-validation
finding: C5
tier_declared: critical
owner_role: ai-engineer
principles: [P-11, P-12, P-13]
touches: [ai-triage-classifier, agent-service]
depends_on:
  nodes: [ai-rag-index, ai-eval-golden-set]
  specs: [004-audit-identity, 006-eval-production-path]
---
# Feature Specification: Triage is validated, and a clinician decides

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; later QLT-13 to QLT-17
- **Assumptions:** recorded under "Decided at G2". All three are conditions: clinical decisions that a clinician settles at G3
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
C5, confirmed in Phase 1. `classify_urgency` is three keyword rules with a default of P4. The orchestrator passes the transcript together with retrieved text to it. There is no negation handling ("denies chest pain" matches P1), and anything unmatched is treated as non-urgent. Finding N5 states the last two points on their own; this spec covers them.
Evidence: `src/HealthQCopilot.Agents/Plugins/TriagePlugin.cs:15-39`; `src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs:148-158`.

## User Stories
- As a patient with an urgent problem, I want my words to be assessed on what I said, so that I am not sent to the back of the queue by a keyword rule.
- As a triage nurse, I want the system to propose a level and show why, so that I decide with its help and not on its word.
- As a clinical safety officer, I want the triage logic proven against cases a clinician labelled, so that a change to it cannot quietly make it worse.

## Requirements
- **FR-001**: The classifier MUST assign P1 to every case in the golden set that a clinician labelled P1.
- **FR-002**: The classifier MUST meet each threshold in its evaluation plan before a version of it is released.
- **FR-003**: The classifier MUST receive the patient's transcript as its only clinical input.
- **FR-004**: The classifier MUST treat a symptom the patient denies as absent.
- **FR-005**: Input the classifier cannot place MUST be sent to a clinician as unclassified.
- **FR-006**: The system MUST present every proposed triage level to a clinician for confirmation, with the words that led to it.
- **FR-007**: A proposed level MUST NOT lower a patient's priority until a clinician confirms it.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the golden set signed by a clinician, When the evaluation of 006 runs against the production classifier, Then no case labelled P1 receives a lower level.
- **AC-002** (verifies FR-002): Given the thresholds in the evaluation plan, When a version of the classifier is evaluated, Then the release is blocked unless every threshold is met.
- **AC-003** (verifies FR-003) (abuse case): Given a transcript with no urgent symptom and retrieved text that contains "chest pain", When the case is classified, Then the level is the same as with no retrieved text.
- **AC-004** (verifies FR-003) (abuse case): Given retrieved text that contains an instruction to mark the case non-urgent, When the case is classified, Then the level is unchanged and the instruction is reported.
- **AC-005** (verifies FR-004): Given the transcript "denies chest pain, has a mild cough", When it is classified, Then the level is not P1 on account of chest pain.
- **AC-006** (verifies FR-005): Given a transcript that matches no rule, When it is classified, Then it appears in the clinician's queue as unclassified and is not given P4.
- **AC-007** (verifies FR-006): Given a proposed level, When a clinician opens the case, Then they see the level and the phrases that produced it, and can confirm or change it.
- **AC-008** (verifies FR-007): Given a patient waiting at P2 and a new proposal of P4, When no clinician has confirmed it, Then the patient is still handled as P2.

## Non-Functional Requirements
- **NFR-001**: Every classification records the classifier version, the rule or model output that produced it, and the clinician's decision.
- **NFR-002**: Time to a proposed level is stated in the evaluation plan and measured in the evaluation.

## Risks
- Under-triage harms patients. Over-triage overloads clinicians. The thresholds trade one against the other, and that trade belongs to a clinician.
- If the plan replaces the rules with a model, transcript text goes to a model provider. The HIPAA pack then requires the agreement status of that provider, and redaction (H1) becomes a dependency.
- Keeping retrieved text away from the classifier may remove context that helped in some cases. The evaluation is how that is known.

## Out of Scope
- The evaluation harness itself (006). Redaction of PHI before it reaches a model (H1). Hardcoded accuracy figures shown to users (H4).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (condition, for a clinician at G3): raising a patient's priority needs no confirmation and happens at once; lowering it does.
- A2 (condition, for a clinician at G3): zero misses on P1 in the golden set is a release condition. The other thresholds, and the clinician who signs them, are named in the evaluation plan.
- A3 (condition, for a clinician at G3): "unclassified" is a level of its own in the queue, shown above P3.

## PHI Involved
The patient's transcript and the triage level. Retrieved clinical reference text is not PHI.

## Access Control
A triage proposal and its confirmation are visible to the clinicians entitled to the patient (002).

## Audit Controls
Each proposal, the version that made it, and the clinician's confirmation or change are recorded (NFR-001).

## Integrity
A proposed level cannot replace a confirmed one without a clinician (FR-007).

## Authentication
The confirming clinician is the user in the validated token (003).

## Transmission Security
No new channel in this spec. If the plan sends transcript text to a model provider, the plan states the channel, the agreement and what is redacted.

## Minimum Necessary
The classifier receives the transcript only (FR-003). Retrieved text and other record content are kept from it.
