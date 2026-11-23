---
spec: 016-audit-record-content
finding: N4
tier_declared: critical
owner_role: security-compliance
principles: [P-9]
touches: [lib-infrastructure, phi-audit-logs]
depends_on:
  nodes: [event-hubs-audit]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 007-audit-export-complete, 008-audit-append-only, 015-audit-write-durable]
---
# Feature Specification: An audit record says whose data was reached, in which tenant, and what happened

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; later CHG-1 to CHG-4
- **Assumptions:** A1 to A3 under "Decided at G2". The tier follows the components: both are Critical
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
N4, found in Phase 1. The audit record holds the user, the method, the path, the status and the time. It has no tenant, no patient and no outcome. Which paths are audited is a hardcoded list of prefixes.
Evidence: `src/HealthQCopilot.Infrastructure/Persistence/AuditDbContext.cs:38-47`; `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs:22-36`.

## User Stories
- As a privacy officer, I want to ask "who reached this patient's data" and get an answer from the audit trail, so that I do not have to reconstruct it from request paths.
- As a tenant administrator, I want my organisation's audit records to be separable from everyone else's.

## Requirements
- **FR-001**: An audit record MUST carry the tenant of the request.
- **FR-002**: An audit record MUST carry the identifier of each patient whose data the request read or changed.
- **FR-003**: An audit record MUST carry the outcome of the request as allowed, refused or failed.
- **FR-004**: Every endpoint that reads or changes PHI MUST be declared as audited on the endpoint itself.
- **FR-005**: The build MUST fail when an endpoint that returns a PHI type is not declared as audited.
- **FR-006**: The change to the record's shape MUST have a data-change plan that names every reader of the audit store.
- **FR-007**: Records written before the change MUST remain readable by the export.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a clinician of tenant A, When they read a patient record, Then the audit record's tenant is A, taken from the token.
- **AC-002** (verifies FR-002): Given a request that returns two patients, When its audit record is read, Then it names both patients and no others.
- **AC-003** (verifies FR-003) (abuse case): Given a request refused for lack of entitlement, When its audit record is read, Then the outcome is refused and the patient asked for is named.
- **AC-004** (verifies FR-004): Given the endpoints of all nine services, When the architecture test lists those that return a PHI type, Then each is declared as audited.
- **AC-005** (verifies FR-005): Given a change that adds an endpoint returning a PHI type with no audit declaration, When the architecture tests run, Then they fail and name the endpoint.
- **AC-006** (verifies FR-006): Given the data-change plan, When the kit's check reads it against the system map, Then every reader of the audit store on the map is named in the plan.
- **AC-007** (verifies FR-007): Given records written before and after the change, When an export is taken across both, Then it holds both, and the older ones show the new fields as not recorded.

## Non-Functional Requirements
- **NFR-001**: The patient identifier in an audit record is the internal identifier, never a name or a record number.

## Risks
- Adding a patient identifier makes the audit record itself PHI in the strict sense. Its protection (008) and who may read it matter more after this change.
- The shape changes in nine tables and in the audit event stream. Every reader has to be found from the map and told.
- Knowing which patients a request touched is not always possible from the path. Some endpoints will need to state it from their results.

## Out of Scope
- Who the record names (004). Lost records (015). Export across services (007). Protection (008).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): the tenant recorded is the token's tenant (003), never a header's.
- A2 (accepted): a request that reaches many patients, such as a list, records each identifier, up to a limit the plan states; past it, the record says how many and by what query.
- A3 (accepted): records written before the change are kept as they are and are not back-filled.

## PHI Involved
The audit record, which gains a tenant, patient identifiers and an outcome.

## Access Control
No change to who may read audit records. Because the record now names patients, reading it is itself an access to PHI.

## Audit Controls
This spec completes the audit control: a record answers who, whose data, in which tenant, and with what result.

## Integrity
Older records are kept unchanged (A3). Protection against alteration is 008.

## Authentication
The user and tenant recorded come from the validated token (003, 004).

## Transmission Security
Unchanged. The audit event stream carries the new fields over the existing channel.

## Minimum Necessary
The record gains an internal patient identifier and nothing clinical (NFR-001).
