---
spec: 017-visible-failures
finding: M1
tier_declared: critical
owner_role: backend
principles: [P-23]
touches: [repo-config, agent-service]
depends_on:
  nodes: []
  specs: [004-audit-identity, 005-triage-validation, 009-phi-protection, 012-no-fabricated-data, 013-migrations-production-engine]
---
# Feature Specification: Failures are visible: no swallowed errors, discarded tasks or blocking startup

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The finding is rated Medium; the tier here is Critical because a spec's tier may not be lower than that of a component it changes
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
M1, corrected in Phase 1. With the patterns in the verification script there are 128 `catch (Exception)` blocks, 12 bare `catch` blocks, 36 discarded tasks and 7 blocking calls, 6 of them at startup in the agent service.
Evidence: `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section M1; `src/HealthQCopilot.Agents/Program.cs:292-364`.

## User Stories
- As an operator, I want an error to be logged or to stop the request, so that a failure is not hidden behind a success.
- As a developer, I want the build to refuse new hidden failures, so that the count only goes down.

## Requirements
- **FR-001**: A caught exception MUST be logged with its type and the operation that failed, or rethrown.
- **FR-002**: A started task MUST be awaited or handed to a tracked background queue.
- **FR-003**: Startup code MUST NOT block on an asynchronous call.
- **FR-004**: The build MUST fail when new code adds a catch-all that neither logs nor rethrows.
- **FR-005**: The number of existing violations MUST NOT rise above the number in the adoption baseline.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a handler whose dependency throws, When the request is handled, Then the log holds the exception type and the operation, or the request fails.
- **AC-002** (verifies FR-002): Given a background operation started by a request, When it fails, Then the failure is logged with the operation's name and counted by the queue's metrics.
- **AC-003** (verifies FR-003) (abuse case): Given a dependency that does not answer during startup of the agent service, When the service starts, Then it fails to start within its startup timeout and logs why; it does not hang.
- **AC-004** (verifies FR-004): Given a change that adds an empty catch-all, When the build runs, Then it fails and names the line.
- **AC-005** (verifies FR-005): Given the analyzer's count on the default branch and on a change, When they are compared, Then the change's count is not higher.

## Non-Functional Requirements
- **NFR-001**: The analyzer rules are in the repository's build configuration, so every project gets them.

## Risks
- Some catch-alls protect a loop that must keep running. Each such one is kept, logs, and is recorded with its reason.
- Awaiting what was discarded can surface failures that were always there.

## Out of Scope
- Audit writes that are started and not awaited (015). File size (018).

## Questions for G2
- A1 (assumed): the existing 183 violations are recorded in the adoption baseline by rule and count, and worked down by later specs; this spec fixes the six blocking calls at startup and adds the rules.
- A2 (assumed): a tracked background queue already exists in the shared libraries, or the plan adds one.

## PHI Involved
None.

## Access Control
Not applicable: this spec changes nothing here.

## Audit Controls
Not applicable to access records. Failures that were hidden become log entries, which must contain no patient identifier (009).

## Integrity
Not applicable: this spec changes nothing here.

## Authentication
Not applicable: this spec changes nothing here.

## Transmission Security
Not applicable: this spec changes nothing here.

## Minimum Necessary
Not applicable: this spec changes nothing here.
