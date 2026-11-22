---
accepted_by: {reviewer: "", role: "", review_ref: ""}
---
# Safety case: the triage classifier

Draft, waiting at gate G3. Nobody has accepted it. The kit's check fails until a named person accepts it through a pull-request review, and no person in `roles.yml` is a clinician.

## Claim
No patient is handled at a lower priority than a clinician would give them because of what the classifier proposed.

## Evidence
- By design: a proposal changes nothing until a clinician confirms it, and input that fires no rule is sent to a clinician as unclassified (FR-005 to FR-007).
- By test: the abuse cases AC-003 and AC-004, and the workflow tests for AC-006 to AC-008.
- By evaluation: the production classifier, run by the harness of 006 on a golden set a clinician signed, misses no P1 case (FR-001) and meets the thresholds in `ai-eval.yml`.
None of this evidence exists yet. Applying today's rules to today's five cases gives two of five.

## Residual risk
- A clinician can confirm a wrong proposal. The phrases that produced it are shown, which helps and does not prevent it.
- The golden set can miss a kind of case. It covers what its authors thought of.
- The time a patient waits for a clinician to act is not bounded by this spec.
- Negation in free text is handled by rules. Rules miss phrasings.

## Human-in-the-loop control
Every proposed level is shown to a clinician with the rule and phrases that produced it, and takes effect only when the clinician confirms or changes it. A proposal above the patient's current level goes to the top of the queue and alerts the clinician on call. Whether a higher proposal should instead apply at once is the open question between the spec and the constitution; see the plan.
