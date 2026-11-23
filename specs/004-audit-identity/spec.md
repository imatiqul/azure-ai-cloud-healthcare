---
spec: 004-audit-identity
finding: C4
tier_declared: critical
owner_role: backend
principles: [P-9]
touches: [lib-infrastructure, identity-service, voice-service, agent-service, fhir-service, ocr-service, scheduling-service, notification-service, pophealth-service, revenue-service]
changes_existing_code: true
depends_on:
  nodes: [phi-audit-logs, event-hubs-audit, entra-id]
  specs: [001-fail-closed-auth, 003-identity-from-token]
---
# Feature Specification: Audit records name the authenticated user

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3. This is the spec the Phase 7 walkthrough takes through every gate
- **Assumptions:** recorded under "Decided at G2"
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
C4, confirmed in Phase 1. In all nine services the PHI audit middleware is registered before `UseAuthentication`, and it reads the user before it calls the next middleware. The user in every audit record is therefore "anonymous".
Evidence: `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs:62`; the line pairs for each service in `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section C4.

## User Stories
- As a privacy officer looking into an access, I want each audit record to name the person who made the request, so that every disclosure can be accounted for.
- As a clinician, I want my accesses recorded under my own identity, so that someone else's access is never attributed to me or to nobody.

## Requirements
- **FR-001**: Each service MUST run the PHI audit middleware after authentication in its request pipeline.
- **FR-002**: An audit record MUST carry the user identifier from the validated token of the request it describes.
- **FR-003**: A request to an audited path that is refused for lack of a valid token MUST still produce an audit record, marked as unauthenticated.
- **FR-004**: The build MUST fail when a service registers the audit middleware before authentication.
- **FR-005**: The stored shape of the audit record MUST stay as it is.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given each of the nine services, When the architecture test inspects its request pipeline, Then authentication is registered before the audit middleware.
- **AC-002** (verifies FR-002): Given a clinician with a valid token, When they read a patient record through any of the nine services, Then the audit record's user equals the token's subject.
- **AC-003** (verifies FR-002) (abuse case): Given a valid token for user U and an `X-User-Id` header naming user V, When the request is audited, Then the record names U.
- **AC-004** (verifies FR-003): Given a request with no token to an audited path, When it is refused, Then one audit record exists for it with status 401 and the unauthenticated marker in place of a user.
- **AC-005** (verifies FR-004): Given a service whose pipeline registers the audit middleware before authentication, When the architecture tests run, Then they fail and name the service.
- **AC-006** (verifies FR-005): Given the migrations before and after the change, When they are compared, Then none alters the audit table.

## Non-Functional Requirements
- **NFR-001**: The change adds no database round trip to the request path.
- **NFR-002**: All nine services take the change in one release, so that no service audits under the old order after it.

## Risks
- With 001 unfixed, a deployment in demo mode would record the demo user. With 003 unfixed, the tenant is still caller-asserted, though the tenant is not in the record. Both are tested against a valid token here, and the residual risk is recorded; neither is fixed in this change.
- Moving the middleware can change which requests are audited at all. FR-003 exists so that refused requests do not vanish from the trail.
- Readers of the audit store and of the audit event stream have only ever seen "anonymous". Anything that groups or filters on the user field will behave differently.

## Out of Scope
- Tenant, patient and outcome in the record (N4). Lost records when a write fails (N3). Export across all stores (007). Append-only protection (008). If the record's shape has to change after all, that is an amendment, and it needs a data-change plan that names every reader of the audit store.

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): the user identifier is the token's subject claim.
- A2 (accepted): a refused request is recorded with a marker, not with the literal "anonymous", so that the word stops appearing for signed-in users and for nobody.

## PHI Involved
The audit record: user identifier, method, path, status and time. Paths can contain patient identifiers. No field is added.

## Access Control
No change to who may read audit records.

## Audit Controls
This spec is the audit control. After it, each record of access to PHI names the authenticated person, and refused attempts are recorded.

## Integrity
Records are written as they are today. Protection against alteration is 008.

## Authentication
The identity recorded is the one the service validated. Depends on 001 for that identity to be real.

## Transmission Security
Unchanged. Audit events go to the audit event stream over the existing channel.

## Minimum Necessary
Only the user identifier becomes meaningful. No clinical content enters the record.
