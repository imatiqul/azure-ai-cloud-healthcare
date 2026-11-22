---
spec: 001-fail-closed-auth
finding: C1
tier_declared: critical
owner_role: platform
principles: [P-1]
touches: [lib-infrastructure]
depends_on:
  nodes: [entra-id]
  specs: []
---
# Feature Specification: Authentication fails closed

- **Phase and date:** Phase 5, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("G1: yes", "G2: approve"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** recorded under "Decided at G2"
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
C1, corrected in Phase 1. When `AzureAd:ClientId` is absent, all ten services that use the shared authentication code run every request as a demo identity that holds the Admin, Clinician, PlatformAdmin and Patient roles. The deploy workflow keeps "demo auth mode" when its Entra variables are unset. The production gateway configuration does set Entra ID, so the exposure is service-to-service and any environment deployed with the variables missing.
Evidence: `src/HealthQCopilot.Infrastructure/Auth/JwtBearerExtensions.cs:27-34, 73-81`; `.github/workflows/microservice-deploy.yml:457-461`; `src/HealthQCopilot.Gateway/appsettings.Production.json:2-7`.

## User Stories
- As a security officer, I want a service with no identity provider to refuse to run, so that a configuration mistake cannot give every caller every role.
- As a developer, I want a way to run a service on my own machine without Entra ID, so that local work does not need a tenant.

## Requirements
- **FR-001**: A service MUST refuse to start when no identity provider is configured, in every environment other than Development.
- **FR-002**: The demo identity MUST be available only in the Development environment with the development-identity setting switched on.
- **FR-003**: The deploy workflow MUST fail when the identity provider settings for its target environment are missing.
- **FR-004**: Each service MUST write to its startup log the token issuer it trusts.
- **FR-005**: The build MUST fail when code outside the development-identity path creates an authenticated identity without a validated token.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a service configured for the Production environment with `AzureAd:ClientId` absent, When it is started, Then the process exits with a non-zero code and a message that names the missing setting.
- **AC-002** (verifies FR-001): Given the same configuration in a Staging environment, When the service is started, Then it exits in the same way.
- **AC-003** (verifies FR-002): Given the Development environment with the development-identity setting off, When a request arrives with no token, Then the response status is 401.
- **AC-004** (verifies FR-002) (abuse case): Given a Production deployment whose configuration switches the development-identity setting on, When the service is started, Then it refuses to start.
- **AC-005** (verifies FR-003): Given a deploy workflow run for an environment whose Entra variables are unset, When the run reaches its deploy job, Then the job fails before anything is deployed.
- **AC-006** (verifies FR-004): Given a service that has started, When its startup log is read, Then one entry names the issuer it validates tokens against and contains no secret.
- **AC-007** (verifies FR-005): Given a change that adds a second code path which builds an authenticated principal, When the architecture tests run, Then they fail and name the file.

## Non-Functional Requirements
- **NFR-001**: The check at startup adds no network call.
- **NFR-002**: A refusal to start is visible in the platform's health view within one probe interval.

## Risks
- Environments that run today only because of demo mode will stop starting. That is the intent; the plan must list them and the order in which they are fixed.
- Tests and local scripts that rely on the demo identity need the development path, or they break.
- Until this ships, 003 and 004 are tested against a valid token and record the residual risk.

## Out of Scope
- Route guards and silent demo mode in the browser (H3). Authorization of endpoints (002). Where identity is read from (003).

## Decided at G2
The owner approved G2 on 2026-11-22 ("G2: approve"). An item marked accepted stands as written. An item marked as a condition is not settled: the approval holds on the condition that it is settled at G3 by the person named.
- A1 (accepted): "Development" means the ASP.NET Core environment name `Development`. The plan lists any hosted environment that uses that name, and renames it.
- A2 (accepted): no hosted environment, including demos shown to others, may run with the demo identity. If a public demo needs it, that is a waiver with an owner and an end date, not a setting.

## PHI Involved
None directly. The change decides whether any PHI can be reached without a validated identity.

## Access Control
No role or policy changes. The demo identity, which holds four roles, stops existing outside Development.

## Audit Controls
The startup refusal and the trusted issuer are logged. Audit records of access are covered by 004.

## Integrity
Not applicable: no stored data changes.

## Authentication
This spec is the authentication control. A token validated against the configured issuer becomes the only source of identity outside Development.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
Not applicable: no PHI is read or disclosed by this change.
