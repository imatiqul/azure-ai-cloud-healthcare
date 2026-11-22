---
spec: 003-identity-from-token
finding: C3
tier_declared: critical
owner_role: backend
principles: [P-4]
touches: [lib-infrastructure, identity-service]
depends_on:
  nodes: [entra-id, gateway]
  specs: [001-fail-closed-auth]
endpoints_changed: true
---
# Feature Specification: Identity comes from the validated token only

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** recorded under "Decided at G2"
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
C3, confirmed in Phase 1. The tenant of a request is taken from the `X-Tenant-Id` header in preference to the token's `tid` claim (4 reads). Break-glass access takes `RequestedByUserId` from the request body, and its route group has no authorization. `X-User-Id` is accepted as the user for log context.
Evidence: `src/HealthQCopilot.Infrastructure/Middleware/TenantContextMiddleware.cs:27-36`; `src/HealthQCopilot.Identity/Endpoints/BreakGlassEndpoints.cs:27-54`.

## User Stories
- As a tenant administrator, I want a caller's tenant to be the one their token proves, so that a header cannot move them into my organisation.
- As a privacy officer, I want an emergency-access grant to name the person who really asked for it, so that break-glass can be reviewed afterwards.

## Requirements
- **FR-001**: The tenant of a request MUST be taken from the tenant claim of the validated token.
- **FR-002**: A request whose `X-Tenant-Id` header differs from the token's tenant claim MUST be refused with status 403.
- **FR-003**: A break-glass request MUST record as its requester the user in the validated token.
- **FR-004**: Every break-glass endpoint MUST be guarded by a named authorization policy.
- **FR-005**: Log context MUST take the user identifier from the validated token.
- **FR-006**: The build MUST fail when code reads a tenant, user or role from a request header or body.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a token for tenant A and no tenant header, When a tenant-scoped endpoint is called, Then the request is handled as tenant A.
- **AC-002** (verifies FR-002) (abuse case): Given a token for tenant A and an `X-Tenant-Id` header naming tenant B, When any endpoint is called, Then the response status is 403 and nothing of tenant B is returned.
- **AC-003** (verifies FR-003) (abuse case): Given a token for user U and a request body whose `RequestedByUserId` names user V, When break-glass access is requested, Then the grant and its event name U as the requester.
- **AC-004** (verifies FR-004): Given a caller with a valid token and without the break-glass role, When they request break-glass access, Then the response status is 403.
- **AC-005** (verifies FR-005) (abuse case): Given a token for user U and an `X-User-Id` header naming user V, When a request is logged, Then the log context names U.
- **AC-006** (verifies FR-006): Given a change that reads the tenant from a header, When the architecture tests run, Then they fail and name the file.

## Non-Functional Requirements
- **NFR-001**: The event `identity.break-glass.granted` keeps its shape; only the value of the requester changes.

## Risks
- A client or the gateway may send `X-Tenant-Id` today for a legitimate reason. FR-002 refuses a mismatch; the plan must find every sender first.
- With 001 unfixed, "the validated token" can still be the demo identity. Tests use a valid token and the residual risk is recorded.

## Out of Scope
- Scoping queries by tenant and patient (002). Who is allowed to request break-glass access beyond "a named policy" (the policy's roles are a plan decision).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): a mismatching tenant header is refused, not ignored. Refusing shows up misuse; the plan finds every client that sends the header before the change ships.
- A2 (accepted): multi-tenant users pick a tenant by signing in to it, not by sending a header.

## PHI Involved
Tenant and user identifiers, and the emergency-access grant. No clinical content.

## Access Control
Break-glass endpoints gain a policy. The tenant used for every later access decision becomes the token's.

## Audit Controls
A break-glass grant names its true requester, which is what makes emergency access reviewable. Attribution of ordinary access records is 004.

## Integrity
The requester recorded on a grant can no longer be chosen by the caller.

## Authentication
Identity, tenant and roles come from the token the service validated. Depends on 001.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
Not applicable: no additional PHI is read or disclosed.
