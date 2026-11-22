---
spec: 013-migrations-production-engine
finding: H5
tier_declared: critical
owner_role: data-owner
principles: [P-18, P-19]
touches: [lib-infrastructure, identity-service, voice-service, agent-service, fhir-service, ocr-service, scheduling-service, notification-service, pophealth-service, revenue-service, identity-db, voice-db, agent-db, fhir-db, ocr-db, scheduling-db, notification-db, pophealth-db, revenue-db]
changes_existing_code: true
depends_on:
  nodes: [postgres]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 005-triage-validation, 007-audit-export-complete, 008-audit-append-only, 009-phi-protection, 015-audit-write-durable, 016-audit-record-content]
---
# Feature Specification: Migrations are written for, and tested on, the engine production runs

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3; later CHG-1 to CHG-4, CHG-17
- **Assumptions:** A1 and A2 under "Decided at G2". The finding is rated High; the tier here is Critical because the change touches Critical components
- **Unverified:** nothing was built or run, and no migration was applied to any database; the evidence is from reading files in Phase 1 and a file listing on 2026-11-22

## Finding
H5, confirmed in Phase 1. Of 53 migration files, 24 carry SQLite column types. The design-time factory uses SQLite. On PostgreSQL the application ignores `PendingModelChangesWarning`, with a comment that says why. The migrations sit in the nine service projects.
Evidence: `src/HealthQCopilot.Infrastructure/Persistence/DatabaseExtensions.cs:46-52`; `src/HealthQCopilot.Agents/Infrastructure/AgentDbContextFactory.cs:11`.

## User Stories
- As a database owner, I want every migration proven on the engine it will run on, so that a deployment does not discover at run time what a test database hid.
- As a developer, I want the pipeline to tell me when my model and my migrations disagree, so that the warning is not something to switch off.

## Requirements
- **FR-001**: Every migration MUST be generated against the engine production runs.
- **FR-002**: The design-time factory of each service MUST use the engine production runs.
- **FR-003**: The application MUST NOT suppress a migration warning.
- **FR-004**: The pipeline MUST apply all migrations to an empty database of the production engine and version whenever a migration or a model changes.
- **FR-005**: The pipeline MUST fail when a service's model and its migrations disagree.
- **FR-006**: A database migrated from empty MUST have the same schema as a copy of a production database brought up to date.
- **FR-007**: The environment parity record MUST state, for each data store, the engine and version in test and in production.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the migration files of all nine services, When the kit's engine check reads them, Then none carries a column type of another engine.
- **AC-002** (verifies FR-002): Given each service's design-time factory, When it is inspected by the architecture test, Then it creates a context for the production engine.
- **AC-003** (verifies FR-003) (abuse case): Given a change that adds a line ignoring a migration warning, When the kit's suppression check runs, Then it fails and names the line.
- **AC-004** (verifies FR-004): Given a change to a migration, When the pull request's checks run, Then a job applies every migration of that service to an empty database of the production engine and version, and records the run.
- **AC-005** (verifies FR-005): Given a model change with no migration, When the pipeline runs, Then it fails and names the service.
- **AC-006** (verifies FR-006): Given a schema dump of a database migrated from empty and one of a restored production copy brought up to date, When they are compared, Then they are the same.
- **AC-007** (verifies FR-007): Given the environment parity record, When it is read, Then each of the mapped data stores has an engine and a version for test and for production, and every difference has a reason.

## Non-Functional Requirements
- **NFR-001**: The migration job for one service finishes within the time the plan states.
- **NFR-002**: No real data is used: the production copy in AC-006 is a restored backup with its data replaced by synthetic records, or a schema-only copy.

## Risks
- Twenty-four migrations describe a schema in another engine's terms. What production databases hold today may differ from what the migrations say. Finding out is the first step of the plan, and it needs read access that only the owner can arrange.
- Correcting history can be done by new corrective migrations or by a new baseline. A new baseline is simpler and harder to undo. The data-change plan chooses, classifies the change, and tests the way back.
- Tests that ran on SQLite may stop passing on PostgreSQL. Each such test was hiding a difference.

## Out of Scope
- Protection of the audit table (008). Encryption of PHI fields (009). Engines other than PostgreSQL: the vector store, the cache and the document store have their own records under the parity requirement and no migrations here.

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): tests that need a relational database use PostgreSQL in a container, at the production major version.
- A2 (accepted): comparing against production uses a schema-only copy; no production data leaves production.

## PHI Involved
Every service database holds PHI. This spec changes schemas and how they are produced, not the data.

## Access Control
Not applicable: no access rule changes. Reading a production schema for AC-006 is arranged by the owner.

## Audit Controls
Each migration run in the pipeline is recorded with the engine, the version and the migrations applied.

## Integrity
The point of the spec: the schema that tests prove is the schema production gets, and a change that would lose data is declared and planned.

## Authentication
Not applicable: no identity changes.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
A schema-only copy is used for comparison, so no PHI is read (A2).
