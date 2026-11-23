---
spec: 018-reviewable-files
finding: M2
tier_declared: critical
owner_role: solutions-architect
principles: [P-24, P-21]
touches: [shell, voice-mfe, fhir-service]
depends_on:
  nodes: []
  specs: [004-audit-identity, 009-phi-protection, 011-frontend-route-guards, 013-migrations-production-engine]
---
# Feature Specification: Source files stay small enough to review

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The finding is rated Medium; the tier here is Critical because a spec's tier may not be lower than that of a component it changes
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
M2, confirmed in Phase 1. The largest files are `VoiceSessionController.tsx` at 1,030 lines, `WorkflowOperationsWorkbench.tsx` at 972 and `FhirEndpoints.cs` at 812.
Evidence: `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section M2; `frontend/apps/voice-mfe/src/components/VoiceSessionController.tsx`; `frontend/apps/shell/src/pages/WorkflowOperationsWorkbench.tsx`; `src/HealthQCopilot.Fhir/Endpoints/FhirEndpoints.cs`.

## User Stories
- As a reviewer, I want a change to land in a file I can read in one sitting, so that I can approve it knowing what it does.
- As a developer, I want the three largest files split without their behaviour changing.

## Requirements
- **FR-001**: A source file over 600 lines MUST be split or carry a recorded reason.
- **FR-002**: The build MUST fail when a file passes 600 lines with no recorded reason.
- **FR-003**: Each of the three files named in the finding MUST be split into files of 600 lines or fewer.
- **FR-004**: The behaviour of the three files MUST be pinned by characterization tests before they are split.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the source tree after the change, When the size check runs, Then every file over 600 lines has an entry in the reasons file with an owner.
- **AC-002** (verifies FR-002): Given a change that takes a file from 590 to 610 lines, When the build runs, Then it fails and names the file.
- **AC-003** (verifies FR-003): Given the three files after the change, When their line counts are taken, Then none is over 600.
- **AC-004** (verifies FR-004): Given the characterization tests written before the split, When they run after it, Then they pass unchanged.

## Non-Functional Requirements
- **NFR-001**: Generated files and test data are left out of the size check by an explicit list.

## Risks
- Splitting a controller or a component changes nothing a user sees, and can still break state handling. The characterization tests are the protection, and they have to exist first.
- `FhirEndpoints.cs` is in a Critical service. Its split is reviewed as a change to that service.

## Out of Scope
- Authorization of the endpoints in `FhirEndpoints.cs` (002).

## Questions for G2
- A1 (assumed): the 600 lines of principle P-24 count every line of a file, comments and blank lines included.
- A2 (assumed): files over the limit other than these three are recorded with a reason and an owner, and split by later specs.

## PHI Involved
The three files handle PHI on screen or in an API. This spec moves code and changes no behaviour.

## Access Control
Unchanged: the split moves code and keeps every access rule where it is. The split of the endpoints of the Critical service is reviewed as a change to that service (Risks).

## Audit Controls
Unchanged: the split keeps every audited endpoint audited.

## Integrity
Characterization tests show that behaviour is unchanged by the split (FR-004).

## Authentication
Not applicable: this spec changes nothing here.

## Transmission Security
Not applicable: this spec changes nothing here.

## Minimum Necessary
Not applicable: this spec changes nothing here.
