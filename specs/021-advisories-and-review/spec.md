---
spec: 021-advisories-and-review
finding: M5
tier_declared: high
owner_role: security-compliance
principles: [P-16, P-17]
touches: [repo-config]
depends_on:
  nodes: []
  specs: [017-visible-failures, 020-repository-hygiene]
---
# Feature Specification: Suppressed advisories are removed or waived, and reviews do not lapse

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The tier follows the component. This spec also covers finding N10
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
M5, confirmed in Phase 1. Five advisories are suppressed, one of them marked critical (HotChocolate.Language); the comment dates the suppression to April 2026. Finding N10 adds that the last commit before this work is from 2026-08-03 and that the suppressions say "revisit" as of April 2026, so the review is overdue. The kit's waiver check, run over a copy of the repository on 2026-11-22, counts the same five suppressions and finds no waiver for any.
Evidence: `Directory.Build.props:11-22`.

## User Stories
- As a security officer, I want every known vulnerability we have chosen to live with to have an owner and an end date, so that "revisit" is a date and not a hope.
- As a maintainer, I want the pipeline to tell me when that date has passed.

## Requirements
- **FR-001**: Every suppressed advisory MUST be removed or covered by a waiver that names an owner, a reason and an expiry.
- **FR-002**: The waiver for an advisory rated critical MUST be approved by Security and Compliance.
- **FR-003**: The pipeline MUST fail when an advisory suppression is added with no waiver.
- **FR-004**: The pipeline MUST fail when a waiver is past its expiry.
- **FR-005**: A dependency update that fixes an advisory MUST be merged or waived within the number of days the waiver policy states.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the build configuration after the change, When the kit's waiver check runs, Then each remaining suppression is matched by a waiver with an owner, a reason and an expiry.
- **AC-002** (verifies FR-002): Given the waiver for the advisory rated critical, When the kit's approver check reads it, Then its approval is by a person holding the Security and Compliance role.
- **AC-003** (verifies FR-003) (abuse case): Given a change that adds a suppression with no waiver, When the pull request's checks run, Then they fail and name the advisory.
- **AC-004** (verifies FR-004): Given a waiver whose expiry was yesterday, When the checks run, Then they fail and name the waiver.
- **AC-005** (verifies FR-005): Given an open update that fixes an advisory and is older than the policy allows, When the scheduled check runs, Then it fails and names the update.

## Non-Functional Requirements
- **NFR-001**: The advisory audit runs on every pull request and on a schedule, so that a new advisory is seen without a change.

## Risks
- Removing a suppression can turn the build red at once, where a fixed version does not exist. A waiver with a short expiry is the honest state.
- The critical advisory has been suppressed since April 2026. Whether it is exploitable here was not assessed in Phase 1.

## Out of Scope
- Pinning of actions and images (014, 024). Skipped tests (019).

## Questions for G2
- A1 (assumed): the waiver policy's number of days is 30 for an update that fixes an advisory, and 7 where the advisory is rated critical.
- A2 (assumed): no separate spec is written for N10; this one covers it.

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
