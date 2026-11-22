---
spec: 014-pipeline-gates
finding: H6
tier_declared: high
owner_role: devops-sre
principles: [P-16, P-17]
touches: [ci-pipeline]
depends_on:
  nodes: []
  specs: []
---
# Feature Specification: A failing gate stops the change, and everything the pipeline uses is pinned

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; GOV-15, GOV-16
- **Assumptions:** A1 and A2 under "Decided at G2"
- **Unverified:** nothing was built or run in the healthcare repository's pipeline. The counts are from Phase 1 and from the kit's own checks run over a copy of the repository on 2026-11-22

## Finding
H6, corrected in Phase 1. The workflows hold 40 escapes: 27 `continue-on-error: true` and 13 `|| true`. There are 200 `uses:` lines and none is pinned to a commit. There are 16 `:latest` references. The kit's pinning check, run over a copy of the repository, counts the same 200.
Evidence: `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section H6; the 36 files under `.github/workflows`.

## User Stories
- As a release manager, I want a failed check to stop a change, so that green means something.
- As a security officer, I want every action and image the pipeline runs to be the one that was reviewed, so that a moved tag cannot change what runs.

## Requirements
- **FR-001**: Every `continue-on-error` and every `|| true` in a workflow MUST be removed or covered by a waiver that names an owner, a reason and an expiry.
- **FR-002**: Every action reference MUST be pinned to a commit.
- **FR-003**: Every container image reference MUST be pinned to a digest.
- **FR-004**: The pipeline MUST fail when a workflow gains an escape that has no waiver.
- **FR-005**: The number of waived escapes MUST NOT rise above the number in the adoption baseline.
- **FR-006**: The pipeline MUST fail when a waiver is past its expiry.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the workflows after the change, When the kit's waiver check runs, Then every remaining escape is matched by a waiver with an owner, a reason and an expiry.
- **AC-002** (verifies FR-002): Given the workflows after the change, When the kit's pinning check runs, Then it finds no action reference that is not a commit.
- **AC-003** (verifies FR-003): Given the workflows, the container files and the application host, When the pinning check runs, Then it finds no image reference without a digest.
- **AC-004** (verifies FR-004) (abuse case): Given a change that adds `|| true` to a test step, When the pull request's checks run, Then they fail and name the line.
- **AC-005** (verifies FR-005): Given a change that adds a waiver for a new escape, When the checks run against the baseline on the default branch, Then they fail because the count rose.
- **AC-006** (verifies FR-006): Given a waiver whose expiry was yesterday, When the checks run, Then they fail and name the waiver.

## Non-Functional Requirements
- **NFR-001**: Pinned actions and images are kept current by the dependency update tool the repository already uses.

## Risks
- Some of the 40 escapes hide failures that are real. Removing one turns the pipeline red until the failure is fixed or waived. The plan takes them in groups and says which are fixed and which are waived, and until when.
- Pinning 200 references by hand invites mistakes. The plan uses a tool and reviews its output.

## Out of Scope
- Skipped tests (M3) and suppressed advisories (M5), which get their own specs and share the waiver register. Floating tags in development containers (N8).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): the adoption baseline is drafted from the kit's count, with an owner and an expiry for each group, and approved by the owner before this spec's plan.
- A2 (accepted): no waiver runs longer than 90 days without being renewed in a review.

## PHI Involved
None.

## Access Control
Not applicable: no access rule changes.

## Audit Controls
Each waiver records who owns it, why, and until when; the kit's waiver register lists them.

## Integrity
Pinning to a commit or a digest means the pipeline runs what was reviewed.

## Authentication
Not applicable: no identity changes.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
Not applicable: no PHI is used.
