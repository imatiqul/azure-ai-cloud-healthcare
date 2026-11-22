---
spec: 010-bff-authorization
finding: H2
tier_declared: high
owner_role: backend
principles: [P-2]
touches: [bff, contract-graphql]
depends_on:
  nodes: [gateway, entra-id]
  specs: [001-fail-closed-auth, 003-identity-from-token]
endpoints_changed: true
---
# Feature Specification: The GraphQL BFF authenticates, authorizes and limits every query

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Decided at G2"
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
H2, confirmed in Phase 1. The BFF has no authentication and no authorization, forwards no token on its six typed HTTP clients, and has no depth or cost rules. The gateway routes `/graphql` to it.
Evidence: `src/HealthQCopilot.BFF/Program.cs:11-67`; `src/HealthQCopilot.Gateway/appsettings.json:78-80`.

## User Stories
- As a patient, I want the GraphQL door to be held to the same rules as every other door, so that it is not the way round them.
- As an operator, I want a single query to be unable to exhaust the services behind the BFF.

## Requirements
- **FR-001**: The BFF MUST reject a GraphQL request that carries no valid token.
- **FR-002**: Every GraphQL field that returns patient data MUST name the authorization policy that guards it.
- **FR-003**: The BFF MUST forward the caller's token on each call it makes to a service.
- **FR-004**: The BFF MUST refuse a query deeper than the limit in its configuration.
- **FR-005**: The BFF MUST refuse a query whose computed cost is above the limit in its configuration.
- **FR-006**: The build MUST fail when a GraphQL field has neither a policy nor an allowlist entry.

## Acceptance Criteria
- **AC-001** (verifies FR-001) (abuse case): Given a GraphQL request with no token sent straight to the BFF, When it is received, Then the response status is 401 and no service is called.
- **AC-002** (verifies FR-002): Given the schema, When the architecture test lists its fields, Then every field that returns patient data has a named policy.
- **AC-003** (verifies FR-003): Given a clinician's request through the BFF, When a service receives the call the BFF makes for it, Then the service sees the clinician's identity and not the BFF's.
- **AC-004** (verifies FR-004) (abuse case): Given a query nested one level deeper than the limit, When it is sent, Then it is refused before any resolver runs.
- **AC-005** (verifies FR-005) (abuse case): Given a query whose computed cost is above the limit, When it is sent, Then it is refused before any resolver runs.
- **AC-006** (verifies FR-006): Given a change that adds a field with no policy, When the architecture tests run, Then they fail and name the field.

## Non-Functional Requirements
- **NFR-001**: Refusing a query on depth or cost takes no call to a service.
- **NFR-002**: The depth and cost limits are in configuration and are covered by tests at the limit and one past it.

## Risks
- Existing clients may send queries deeper or costlier than a limit allows. The plan measures current queries before it sets the numbers.
- Forwarding the caller's token means the services decide access. Until 002 ships, they decide nothing, so this spec alone closes the unauthenticated door and not the scoping gap.

## Out of Scope
- Authorization and scoping inside the services (002). Browser route guards (011).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): the depth and cost limits are numbers set in the plan from measured queries, not here.
- A2 (accepted): the BFF never calls a service under an identity of its own for a user's request.

## PHI Involved
Whatever the six services behind the BFF return. This spec changes who can ask, not what is stored.

## Access Control
A token is required, and each field that returns patient data names its policy. The services apply their own policies to the forwarded identity.

## Audit Controls
Because the caller's token is forwarded, the services' audit records name the caller and not the BFF.

## Integrity
Not applicable: no stored data changes.

## Authentication
The BFF validates the token as every service does. Depends on 001 and 003.

## Transmission Security
Unchanged. The token is forwarded over the existing service-to-service channel.

## Minimum Necessary
Depth and cost limits bound how much one request can pull. Scoping of what a caller may see is 002.
