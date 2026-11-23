---
spec: 015-audit-write-durable
finding: N3
tier_declared: critical
owner_role: security-compliance
principles: [P-10]
touches: [lib-infrastructure]
depends_on:
  nodes: [phi-audit-logs, event-hubs-audit]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 008-audit-append-only]
---
# Feature Specification: An audit record is never lost without the request failing

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Decided at G2". The tier follows the component: the shared infrastructure library is Critical
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
N3, found in Phase 1. Audit writes are started and not awaited, and a failure is only logged. An audit record can be lost while the request it describes succeeds.
Evidence: `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs:82, 112-115`.

## User Stories
- As a privacy officer, I want every access to PHI to have its record, so that the trail has no holes I cannot see.
- As an operator, I want to be told at once when audit records cannot be written, so that I am not told by an auditor months later.

## Requirements
- **FR-001**: A request to an audited path MUST fail when its audit record cannot be written.
- **FR-002**: The audit record MUST be written before the response is sent to the caller.
- **FR-003**: A failed audit write MUST raise an alert to the operations channel.
- **FR-004**: Every audit record in the store MUST also reach the audit event stream.
- **FR-005**: The build MUST fail when audit code starts a write and does not await its result.

## Acceptance Criteria
- **AC-001** (verifies FR-001) (abuse case): Given an audit store that refuses writes, When a clinician requests a patient record, Then the response status is 503 and the body holds no patient data.
- **AC-002** (verifies FR-002): Given a successful request to an audited path, When the response reaches the caller, Then its audit record is already in the store.
- **AC-003** (verifies FR-003): Given the refusal in AC-001, When the alerts of the test environment are read, Then one names the audit store and the service.
- **AC-004** (verifies FR-004): Given an audit event stream that is unreachable for a time and then returns, When the stream is read afterwards, Then it holds every record the store holds for that time.
- **AC-005** (verifies FR-005): Given a change that discards the task of an audit write, When the build runs, Then it fails and names the line.

## Non-Functional Requirements
- **NFR-001**: The added time per audited request is stated in the plan and measured in the integration tests.

## Risks
- This trades availability for evidence: while the audit store is down, PHI cannot be read. The owner accepted that trade in the constitution (P-10). The plan says how the store is made dependable enough to bear it.
- Writing before responding adds time to every audited request.
- With nine audit tables (007), "the audit store" is nine things that can fail.

## Out of Scope
- Who the record names (004). What it holds (016). Export (007). Protection of the table (008).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): the refusal is 503 with no patient data, for reads as well as writes.
- A2 (accepted): the event stream may lag the store, but may not lose a record.

## PHI Involved
The audit record. No field is added by this spec.

## Access Control
Not applicable: no access rule changes. Access fails closed when it cannot be recorded.

## Audit Controls
This spec makes the audit control dependable: no access without a record.

## Integrity
A record cannot be dropped silently between the request, the store and the event stream.

## Authentication
Not applicable: no identity changes.

## Transmission Security
Unchanged. Records go to the audit event stream over the existing channel, with redelivery.

## Minimum Necessary
Not applicable: no additional PHI is read or disclosed.
