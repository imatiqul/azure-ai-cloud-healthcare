---
spec: 022-cors-allowlist
finding: N6
tier_declared: critical
owner_role: security-compliance
principles: [P-5]
touches: [gateway]
depends_on:
  nodes: []
  specs: []
---
# Feature Specification: Cross-origin access is an explicit allowlist

- **Phase and date:** Phase 5, batch 3, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The finding is rated Medium; the tier here is Critical because a spec's tier may not be lower than that of a component it changes
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
N6, found in Phase 1. The gateway's CORS policy allows any header and any method with credentials, and falls back to a localhost origin when none is configured.
Evidence: `src/HealthQCopilot.Gateway/Program.cs:13-22`.

## User Stories
- As a security officer, I want only our own front ends to be able to call the gateway from a browser with a user's credentials.

## Requirements
- **FR-001**: The gateway MUST allow cross-origin requests only from origins on a configured allowlist.
- **FR-002**: The gateway MUST refuse to start in a hosted environment when the origin allowlist is empty.
- **FR-003**: The gateway MUST list the methods and headers it allows across origins when credentials are allowed.
- **FR-004**: The build MUST fail when a cross-origin policy combines credentials with a wildcard.

## Acceptance Criteria
- **AC-001** (verifies FR-001) (abuse case): Given a browser request with credentials from an origin that is not on the allowlist, When it reaches the gateway, Then the response carries no header that allows that origin.
- **AC-002** (verifies FR-002): Given a Production configuration with no allowed origin, When the gateway starts, Then it exits with a message that names the missing setting.
- **AC-003** (verifies FR-003): Given a preflight request for a method that is not listed, When it reaches the gateway, Then it is refused.
- **AC-004** (verifies FR-004): Given a change that allows any header with credentials, When the architecture tests run, Then they fail and name the policy.

## Non-Functional Requirements
- **NFR-001**: The allowlist is read from configuration at startup; changing it needs no code change.

## Risks
- A front end served from an origin nobody listed stops working. The plan lists every origin in use first.

## Out of Scope
- Authorization of endpoints (002). Environment values in tracked files (023).

## Questions for G2
- A1 (assumed): the localhost origin is allowed only in the Development environment.
- A2 (assumed): the allowed methods and headers are those the front ends use today, listed in the plan.

## PHI Involved
Whatever the gateway proxies. This spec changes which web origins may ask with a user's credentials.

## Access Control
A browser on an origin that is not listed can no longer use a signed-in user's session against the gateway.

## Audit Controls
Not applicable: this spec changes nothing here.

## Integrity
Not applicable: this spec changes nothing here.

## Authentication
Not applicable: this spec changes nothing here.

## Transmission Security
Cross-origin requests with credentials are limited to listed origins, methods and headers.

## Minimum Necessary
Not applicable: this spec changes nothing here.
