---
spec: 024-pinned-dev-containers
finding: N8
tier_declared: medium
owner_role: devops-sre
principles: [P-17]
touches: [dev-apphost]
depends_on:
  nodes: []
  specs: []
---
# Feature Specification: Development containers are pinned

- **Phase and date:** Phase 5, batch 4, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 to A3 under "Questions for G2". The tier follows the component
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
N8, found in Phase 1. The application host starts development containers with floating tags, `2022-latest` and `latest`. The kit's pinning check, run over a copy of the repository on 2026-11-22, finds the same two lines, and three more containers in the same file that have a version and no digest.
Evidence: `src/HealthQCopilot.AppHost/Program.cs:112, 117`; for the three with a version only, lines 23, 28 and 126.

## User Stories
- As a developer, I want the containers on my machine to be the versions the tests were written for, so that a moved tag does not change my results.

## Requirements
- **FR-001**: Every container image the application host starts MUST be pinned to a version and a digest.
- **FR-002**: The pipeline MUST fail when the application host names an image with a floating tag.
- **FR-003**: The pinned images MUST be listed for the repository's dependency update tool.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the application host after the change, When the kit's pinning check reads it, Then every image has a version and a digest.
- **AC-002** (verifies FR-002): Given a change that sets an image to `latest`, When the pipeline runs, Then it fails and names the line.
- **AC-003** (verifies FR-003): Given the update tool's configuration, When it is read, Then the application host's images are among the things it updates.

## Non-Functional Requirements
- **NFR-001**: The pinned versions are those of the engines production runs, where the parity record (013) names one.

## Risks
- A pinned image goes stale. FR-003 is what keeps it current.

## Out of Scope
- Images in workflows and container files (014). Engine parity between test and production (013).

## Questions for G2
- A1 (assumed): the versions pinned are the production versions where known.
- A2 (assumed): no hosted environment is started from the application host.
- A3 (assumed): the password the same file sets as a literal for the emulator's database (line 114) is outside this spec. It is for a local container, and it is still a credential in source; it is reported to the owner as a new observation. Its value is not recorded here.

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
