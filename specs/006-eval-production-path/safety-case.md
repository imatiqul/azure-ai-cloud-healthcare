---
accepted_by: {reviewer: "", role: "", review_ref: ""}
---
# Safety case: the evaluation gate

Draft, waiting at gate G3. Nobody has accepted it. The kit's check fails until a named person accepts it through a pull-request review.

## Claim
No version of the triage classifier is released on an evaluation that did not run it.

## Evidence
- By design: the harness obtains every level it scores from the production classifier and holds no stand-in (FR-001, FR-008).
- By test: a classifier that always answers P3 fails the evaluation, and so does one that is wrong on a case whose text contains its own answer (AC-002, AC-003).
- By check: the kit's production-path check finds the classifier's name in the harness, finds no redefinition or stub of it, and matches the result file to the hash of the classifier's source.
None of this evidence exists yet. Today the kit's check fails on the existing harness, because the harness never names the classifier.

## Residual risk
- The check is static. It shows the harness names the production symbol and does not replace it; it does not prove every scored value came from that call.
- An evaluation is as good as its golden set, and the set has no clinician's signature.
- A threshold can be lowered in a pull request. The thresholds are in a file a clinician owns, and a change to it is a spec change with its own gates.

## Human-in-the-loop control
A clinician signs each version of the golden set and sets the thresholds. A release of the classifier needs the evaluation's result in the evidence a named person approves at G6.
