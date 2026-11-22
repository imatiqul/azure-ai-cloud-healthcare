---
spec: 002-endpoint-authorization
finding: C2
tier_declared: critical
owner_role: backend
principles: [P-2, P-3]
touches: [lib-infrastructure, identity-service, voice-service, agent-service, fhir-service, ocr-service, scheduling-service, notification-service, pophealth-service, revenue-service]
depends_on:
  nodes: [gateway, entra-id]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 005-triage-validation, 007-audit-export-complete, 008-audit-append-only, 009-phi-protection, 012-no-fabricated-data, 013-migrations-production-engine, 015-audit-write-durable, 016-audit-record-content, 017-visible-failures, 018-reviewable-files, 025-event-contracts]
endpoints_changed: true
---
# Feature Specification: Every endpoint is authorized and scoped

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, MAP-13, TRC-1, PRD-1 to PRD-3
- **Assumptions:** recorded under "Decided at G2"
- **Unverified:** nothing was built or run; the endpoint counts come from `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository

## Finding
C2, corrected in Phase 1. The services expose 263 endpoints (243 minimal API, 20 controller actions). There are 12 `RequireAuthorization` calls and no `[Authorize]` attribute; three of the calls are on groups that cover 10 endpoints. The gateway requires a token on every proxied route, so the gap is authorization and scoping, and any path that reaches a service without the gateway. No tenant or patient scoping was found.
Evidence: `verify-output.txt` (as above), section C2; `src/HealthQCopilot.Gateway/Program.cs:49`.

## User Stories
- As a patient, I want my record to be reachable only by people entitled to it, so that being a user of the platform is not enough to read it.
- As a tenant administrator, I want my organisation's data to be invisible to other tenants, so that one customer cannot read another's patients.
- As a security officer, I want every endpoint's guard to be written down and checked, so that a new endpoint cannot ship unguarded.

## Requirements
- **FR-001**: Every endpoint of every service MUST name the authorization policy that guards it.
- **FR-002**: An endpoint that needs no authorization MUST appear in an allowlist that Security and Compliance has reviewed.
- **FR-003**: Every read of patient data MUST be limited to the tenant in the caller's token.
- **FR-004**: A request for a patient the caller is not entitled to see MUST be refused with status 403.
- **FR-005**: A service MUST apply its authorization policies to a request that did not come through the gateway.
- **FR-006**: The build MUST fail when an endpoint has neither a policy nor an allowlist entry.
- **FR-007**: Each refusal under FR-003 or FR-004 MUST be recorded in the audit trail.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the list of all endpoints produced by the architecture test, When it is compared with the authorization matrix, Then every endpoint has a named policy or an allowlist entry.
- **AC-002** (verifies FR-002): Given the allowlist, When it is read, Then each entry carries a reason and the review in which Security and Compliance accepted it.
- **AC-003** (verifies FR-003) (abuse case): Given a clinician of tenant A with a valid token, When they request a patient list, Then no patient of tenant B is in the response.
- **AC-004** (verifies FR-004) (abuse case): Given a clinician with a valid token, When they request by identifier a patient they are not entitled to see, Then the response status is 403 and the body holds no patient data.
- **AC-005** (verifies FR-005) (abuse case): Given a caller inside the cluster with no token, When it calls a service endpoint directly, Then the response status is 401.
- **AC-006** (verifies FR-006): Given a change that adds an endpoint with no policy and no allowlist entry, When the architecture tests run, Then they fail and name the endpoint.
- **AC-007** (verifies FR-007): Given the refusals in AC-003 to AC-005, When the audit trail is read, Then each has a record with its status.

## Non-Functional Requirements
- **NFR-001**: Tenant and patient scoping is applied in the query, not by filtering results in memory.
- **NFR-002**: The authorization matrix is generated from the code, so it cannot drift from it.

## Risks
- By the Phase 1 counts, the 12 authorization calls cover 19 of the 263 endpoints, so about 244 change behaviour. Clients that work today only because nothing is checked will get 403.
- Scoping needs a trustworthy tenant, which is 003, and a real identity, which is 001.
- The change touches nine services and the shared library. In Phase 6 it becomes a programme spec with one child per service and a stated rollout order.

## Out of Scope
- The GraphQL BFF (H2) and the browser's route guards (H3). Field-level redaction (H1).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): a caller is entitled to a patient when the patient is in the caller's care team or panel as the scheduling and encounter data records it, or the caller holds an active break-glass grant.
- A2 (accepted): a refusal is 403 for an authenticated caller, never an empty result.
- A3 (accepted): service-to-service calls carry a token of their own; no service trusts a caller because of where the call comes from.

## PHI Involved
Every PHI store behind the nine services. This spec changes who can reach it, not what is stored.

## Access Control
This spec is the access control: a named policy on each endpoint, tenant scoping on each read, and a patient-level check.

## Audit Controls
Refusals are recorded (FR-007). The attribution of those records is 004.

## Integrity
Not applicable: no stored data changes.

## Authentication
Depends on 001. A policy can only be as good as the identity it is given.

## Transmission Security
Unchanged. Calls that bypass the gateway are held to the same policies (FR-005).

## Minimum Necessary
Scoping to tenant and patient is the minimum-necessary control for reads: a caller receives only the patients they are entitled to.
