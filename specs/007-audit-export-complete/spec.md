---
spec: 007-audit-export-complete
finding: N1
tier_declared: critical
owner_role: security-compliance
principles: [P-10]
touches: [identity-service, phi-audit-logs]
depends_on:
  nodes: [identity-db, voice-db, agent-db, fhir-db, ocr-db, scheduling-db, notification-db, pophealth-db, revenue-db, event-hubs-audit]
  specs: [003-identity-from-token, 004-audit-identity]
endpoints_changed: true
---
# Feature Specification: An audit export covers every service

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** recorded under "Decided at G2". The tier, Critical, was an agent's proposal from Phase 1 and was approved with the spec
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
N1, found in Phase 1 while mapping the system. The audit table exists once in each service database, nine copies in all. The audit export endpoint reads only the Identity database, so an export leaves out every access made through the other eight services.
Evidence: `AddHealthcareDb<AuditDbContext>` in nine `Program.cs` files; `src/HealthQCopilot.Identity/Endpoints/AuditExportEndpoints.cs:29-67`.

## User Stories
- As a privacy officer answering a patient's request for an accounting of disclosures, I want one export to hold every access, so that my answer is complete.
- As an auditor, I want an export to say what it covers, so that I do not mistake a partial file for the whole trail.

## Requirements
- **FR-001**: An audit export MUST include the records of every service that writes audit records.
- **FR-002**: The system map MUST name every store that holds audit records.
- **FR-003**: An export MUST state each store it read and the number of records it took from each.
- **FR-004**: An export MUST fail, and deliver no file, when a store that holds audit records cannot be read.
- **FR-005**: The build MUST fail when a service writes audit records to a store the export does not read.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given one audited request made through each of the nine services, When an export is taken for that period, Then it holds nine records, one from each service.
- **AC-002** (verifies FR-002): Given the system map, When the stores holding audit records are listed from it, Then the list equals the stores the services are configured to write to.
- **AC-003** (verifies FR-003): Given an export, When its manifest is read, Then each store appears with a record count, and the counts add up to the number of records in the file.
- **AC-004** (verifies FR-004) (abuse case): Given one audit store that cannot be reached, When an export is requested, Then the request fails, names the store, and no file is produced.
- **AC-005** (verifies FR-005): Given a new service that registers an audit store the export does not know, When the architecture tests run, Then they fail and name the service.

## Non-Functional Requirements
- **NFR-001**: An export for a period reads each store once.
- **NFR-002**: The time an export may take for one year of records is stated in the plan and tested.

## Risks
- Two designs meet these requirements: one audit store for all services, or an export that reads all nine. The first changes where records are stored and needs a data-change plan with a tested migration of existing records; the second leaves nine tables to protect (008) and nine places to fail.
- Records written before 004 name nobody. A complete export of them is still an export of "anonymous".
- Failing the whole export when one store is down (FR-004) favours completeness over availability.

## Out of Scope
- What a record contains (004, N4). Lost records when a write fails (N3). Protection of the tables (008). Who may request an export (002).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): the choice between one store and an export across nine is made in the plan at G3, with the Data Owner.
- A2 (accepted): a partial export is never acceptable, even marked as partial.

## PHI Involved
Audit records from all nine services: who reached which path, when, with what status. Paths can contain patient identifiers.

## Access Control
The export stays restricted to the roles the audit-review policy names. That policy is set in 002.

## Audit Controls
This spec makes the audit trail readable as one trail. Taking an export is itself recorded.

## Integrity
An export states its sources and counts (FR-003), so a reader can tell that it is whole.

## Authentication
The person taking an export is the user in the validated token (003).

## Transmission Security
The export file leaves the service over the existing authenticated channel. If the plan adds a place the file is written to, the plan names it and how it is protected.

## Minimum Necessary
An export is limited to the period and the patient or user asked for. This spec widens which services it covers, not which fields.
