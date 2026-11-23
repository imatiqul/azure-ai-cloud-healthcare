---
spec: 011-frontend-route-guards
finding: H3
tier_declared: high
owner_role: frontend
principles: [P-1, P-2]
touches: [pkg-auth-client, shell, encounters-mfe, engagement-mfe, pophealth-mfe, revenue-mfe, scheduling-mfe, triage-mfe, voice-mfe]
depends_on:
  nodes: [entra-id]
  specs: [001-fail-closed-auth, 009-phi-protection]
---
# Feature Specification: Frontend routes are guarded, and sign-in never fails silently

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Decided at G2"
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
H3, confirmed in Phase 1. No frontend app has a route guard or a role check. When the client identifier is not configured, sign-in does nothing and writes a warning to the console.
Evidence: `frontend/packages/auth-client/src/client.ts:31-47`; `examples/healthq/phase-1/verify-output.txt` in the agentic-spec-kit repository, section H3.

## User Stories
- As a user, I want to see only the screens my role allows, so that I am not shown work that is not mine.
- As an operator, I want a misconfigured sign-in to be an obvious failure, so that nobody uses the product in a mode nobody chose.

## Requirements
- **FR-001**: Every route of every frontend app MUST declare the roles that may open it.
- **FR-002**: A user without a role that a route requires MUST be refused the route.
- **FR-003**: A refused route MUST NOT request its data from the server.
- **FR-004**: Sign-in MUST fail with a message on the screen when the client's identity settings are missing.
- **FR-005**: The build of a frontend app for a hosted environment MUST fail when its identity settings are missing.
- **FR-006**: The build MUST fail when a route declares no roles and is not on the public-route allowlist.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the route table of each app, When the build's check reads it, Then every route has declared roles or an allowlist entry.
- **AC-002** (verifies FR-002) (abuse case): Given a signed-in user without the role a route requires, When they open the route's address directly, Then they see a refusal and not the screen.
- **AC-003** (verifies FR-003) (abuse case): Given the same user and route, When the network calls of the page are recorded, Then no request for the route's data was made.
- **AC-004** (verifies FR-004): Given an app started with no client identifier, When a user chooses to sign in, Then the screen shows that sign-in is not configured and the user is not treated as signed in.
- **AC-005** (verifies FR-005): Given a production build with no identity settings, When the build runs, Then it fails and names the missing setting.
- **AC-006** (verifies FR-006): Given a change that adds a route with no roles, When the frontend build runs, Then it fails and names the route.

## Non-Functional Requirements
- **NFR-001**: The roles of a route are declared in one place per app and read by both the guard and the navigation menu.

## Risks
- A route guard in the browser is a courtesy, not a control: the server decides (002). This spec must not be read as closing that gap.
- Role names in the browser can drift from the server's policies. The plan says how they are kept the same.

## Out of Scope
- Server-side authorization (002, 010). PHI in browser storage (009).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): role names come from the token's role claims, the same names the server's policies use.
- A2 (accepted): there is no demo mode in a hosted build. Local development may use the development identity of 001.

## PHI Involved
The screens that display PHI. This spec changes which screens a user is shown.

## Access Control
A courtesy layer over the server's policies: users are not shown routes their role does not allow.

## Audit Controls
Not applicable: refusals in the browser are not audit events. The server's refusals are recorded under 002.

## Integrity
Not applicable: no stored data changes.

## Authentication
Sign-in either works or fails visibly. There is no state in which a user appears signed in without a token.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
A refused route requests no data (FR-003), so a user's browser does not receive records the role should not see.
