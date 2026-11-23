---
spec: 019-skipped-tests
finding: M3
tier_declared: high
owner_role: qa
principles: [P-16, P-21]
touches: [ci-pipeline]
depends_on:
  nodes: []
  specs: [014-pipeline-gates]
---
# Feature Specification: A test that cannot run fails, and every skip is waived

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The tier follows the component
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
M3, confirmed in Phase 1. There are 191 `test.skip(` calls. At least 31 skip when a live service does not respond, so an outage is reported as skipped tests, not failed ones.
Evidence: `frontend/e2e-cloud/cloud-smoke.spec.ts:222-255`; the suites under `frontend/e2e` and `frontend/e2e-cloud`.

## User Stories
- As a release manager, I want an outage to turn the pipeline red, so that a skipped suite is not read as a healthy one.
- As a tester, I want each remaining skip to have an owner and an end date.

## Requirements
- **FR-001**: A test that cannot reach a live service it needs MUST fail.
- **FR-002**: Every remaining skip MUST be covered by a waiver that names an owner, a reason and an expiry.
- **FR-003**: The pipeline MUST fail when a skip is added with no waiver.
- **FR-004**: The number of waived skips MUST NOT rise above the number in the adoption baseline.
- **FR-005**: The pipeline's summary MUST state the number of skipped tests beside the passed and the failed.

## Acceptance Criteria
- **AC-001** (verifies FR-001) (abuse case): Given a cloud smoke test and a service that does not respond, When the suite runs, Then the test fails and names the service.
- **AC-002** (verifies FR-002): Given the suites after the change, When the kit's waiver check runs, Then every skip is matched by a waiver with an owner, a reason and an expiry.
- **AC-003** (verifies FR-003): Given a change that adds `test.skip(` with no waiver, When the pull request's checks run, Then they fail and name the line.
- **AC-004** (verifies FR-004): Given a change that adds a waiver for a new skip, When the checks run against the baseline on the default branch, Then they fail because the count rose.
- **AC-005** (verifies FR-005): Given a pipeline run with skipped tests, When its summary is read, Then the number skipped is shown.

## Non-Functional Requirements
- **NFR-001**: The suites state which live services each test needs, so that the failure in AC-001 can name one.

## Risks
- The 31 conditional skips will fail whenever the cloud environment is down. That is the point, and it will be noisy until the environment is dependable.
- 191 skips cannot all be fixed at once. The baseline records them; the plan takes them in groups.

## Out of Scope
- Escapes in workflow files (014). Suppressed advisories (021).

## Questions for G2
- A1 (assumed): the adoption baseline is the one spec 014 assumes; skips are a group in it.
- A2 (assumed): a skip for a feature that is switched off is a waiver like any other, with an expiry.

## PHI Involved
None.

## Access Control
Not applicable: this spec changes nothing here.

## Audit Controls
Not applicable: this spec changes nothing here.

## Integrity
Not applicable: this spec changes nothing here.

## Authentication
Not applicable: this spec changes nothing here.

## Transmission Security
Not applicable: this spec changes nothing here.

## Minimum Necessary
Not applicable: this spec changes nothing here.
