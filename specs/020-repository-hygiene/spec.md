---
spec: 020-repository-hygiene
finding: M4
tier_declared: high
owner_role: platform
principles: [P-24]
touches: [repo-config, shell]
depends_on:
  nodes: []
  specs: [009-phi-protection, 011-frontend-route-guards, 017-visible-failures, 018-reviewable-files]
---
# Feature Specification: The repository holds source, and its licence statements agree

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The tier follows the components
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
M4, confirmed in Phase 1. There are 47 tracked `.map` files under `@mf-types`, a tracked Playwright report that `.gitignore` lists, and a README that says "Proprietary - all rights reserved" while LICENSE is MIT. A listing on 2026-11-22 finds 134 tracked files under `frontend/apps/shell/@mf-types`.
Evidence: `README.md`, licence section; `LICENSE:1`; `.gitignore`.

On 2026-11-24 the owner decided that the licence is MIT and merged pull request #79, which changes the README's licence section to match the LICENSE file. FR-003 is met by that change, and A1 is no longer an assumption. The change was merged without this spec's gates: no gate of this spec has a recorded decision.

## User Stories
- As a contributor, I want to know the licence I am contributing under, so that the README and the LICENSE file do not tell me different things.
- As a reviewer, I want a diff to show source, so that generated files do not bury the change.

## Requirements
- **FR-001**: Generated type and map files MUST NOT be tracked.
- **FR-002**: Test reports MUST NOT be tracked.
- **FR-003**: The licence statement in the README MUST agree with the LICENSE file.
- **FR-004**: The pipeline MUST fail when a tracked file matches an ignore rule.
- **FR-005**: The frontend build MUST produce the generated type files it needs.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the repository after the change, When tracked files are listed, Then none is under an `@mf-types` folder.
- **AC-002** (verifies FR-002): Given the repository after the change, When tracked files are listed, Then no Playwright report is among them.
- **AC-003** (verifies FR-003): Given the README and the LICENSE file, When the hygiene check compares them, Then both name the same licence.
- **AC-004** (verifies FR-004): Given a change that adds a file matching an ignore rule, When the pipeline runs, Then it fails and names the file.
- **AC-005** (verifies FR-005): Given a clean checkout with no generated type files, When the frontend build runs, Then it succeeds.

## Non-Functional Requirements
- **NFR-001**: The hygiene check runs in under a minute on a clean checkout.

## Risks
- Which licence is right is the owner's decision, not the agent's. The LICENSE file came with the last commit before this work (`6e0879d`, 2026-08-03, "Add MIT License to the project"); the README's sentence is from the first commit (2026-04-07).
- Removing tracked generated files can break a build that relied on them being present. FR-005 covers it.

## Out of Scope
- File size (018). Environment values in configuration (023).

## Questions for G2
- A1 (assumed): the licence is MIT, as the LICENSE file says, and the README is the one to change.
- A2 (assumed): history is not rewritten: the files stop being tracked from this change on.

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
