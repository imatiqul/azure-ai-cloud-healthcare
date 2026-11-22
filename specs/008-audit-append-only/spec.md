---
spec: 008-audit-append-only
finding: N2
tier_declared: critical
owner_role: security-compliance
principles: [P-10, P-18]
touches: [phi-audit-logs, lib-infrastructure]
depends_on:
  nodes: [postgres]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 007-audit-export-complete]
---
# Feature Specification: The database enforces an append-only audit log

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; later CHG-1 to CHG-4
- **Assumptions:** recorded under "Decided at G2". The tier, Critical, was an agent's proposal from Phase 1 and was approved with the spec
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
N2, found in Phase 1. The audit log is described as append-only with row-level security, but the SQL for that exists only as a comment. No migration creates the table or protects it.
Evidence: `src/HealthQCopilot.Infrastructure/Persistence/AuditDbContext.cs:31-34`; `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section C4.

## User Stories
- As an auditor, I want the database to refuse changes to audit records, so that the trail is evidence and not only a table the application promises to leave alone.
- As a database owner, I want the audit table and its protections created by a migration, so that every environment has them and I can see when they change.

## Requirements
- **FR-001**: The database MUST reject an update of an audit record by the application's database role.
- **FR-002**: The database MUST reject a deletion of an audit record by the application's database role.
- **FR-003**: A migration MUST create the audit table and its protections in every database that holds audit records.
- **FR-004**: Row-level security MUST limit the reading of audit records to the database role used for audit review.
- **FR-005**: The build MUST fail when an update or a deletion of an audit record succeeds against a migrated test database.

## Acceptance Criteria
- **AC-001** (verifies FR-001) (abuse case): Given a migrated database and a connection as the application's role, When an `UPDATE` of an audit record is attempted, Then the database refuses it.
- **AC-002** (verifies FR-002) (abuse case): Given the same connection, When a `DELETE` or a `TRUNCATE` on the audit table is attempted, Then the database refuses it.
- **AC-003** (verifies FR-003): Given an empty database of the production engine and version, When the migrations are applied, Then the audit table exists with its protections, and no migration warning is suppressed.
- **AC-004** (verifies FR-004): Given a connection as the application's role, When it selects from the audit table, Then it receives no rows; Given a connection as the audit-review role, Then it receives them.
- **AC-005** (verifies FR-005): Given a change that drops the protection, When the migration test runs, Then it fails.

## Non-Functional Requirements
- **NFR-001**: Inserting an audit record takes no longer after the change than before it, within the margin the plan states.
- **NFR-002**: The migration can be applied to a database that already holds audit records without rewriting them.

## Risks
- Where the audit table was created outside migrations, the migration must adopt the existing table and its records. The plan states how, and tests it on a copy.
- A role that can still alter the table, such as the owner used by migrations, remains able to remove the protection. The plan says who holds that role and how its use is recorded.
- If 007 moves the records to one store, this protection applies to that store, which is why this spec follows 007.

## Out of Scope
- What a record contains (004, N4). Export (007). How long records are kept, which no finding covers.

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): the application's role may insert and nothing else; reading is for a separate audit-review role.
- A2 (accepted): retention of audit records is not part of this spec. It is still undecided, and needs a decision from whoever answers for compliance.

## PHI Involved
Audit records: user identifier, method, path, status and time. Paths can contain patient identifiers.

## Access Control
Reading audit records is limited to the audit-review database role (FR-004).

## Audit Controls
This spec protects the audit control itself: records can be added and not altered or removed by the application.

## Integrity
This spec is the integrity control for the audit trail. The database, not a comment, refuses alteration.

## Authentication
Database roles are separate for the application and for audit review. How each authenticates to the database is unchanged.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
The application's role can no longer read audit records it has no need to read.
