---
spec: 012-no-fabricated-data
finding: H4
tier_declared: critical
owner_role: backend
principles: [P-15, P-5]
touches: [agent-service]
depends_on:
  nodes: [ai-eval-golden-set]
  specs: [004-audit-identity, 005-triage-validation, 006-eval-production-path, 009-phi-protection, 013-migrations-production-engine]
endpoints_changed: true
---
# Feature Specification: No fabricated figures, and no demo endpoints, in a production build

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Decided at G2". The finding is rated High; the tier here is Critical because the agent service is a Critical component
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1

## Finding
H4, confirmed in Phase 1. The agent service maps 22 hardcoded endpoints with no environment check. Among them, `/api/v1/kpi` returns `aiAccuracyRate = 94.2` and accuracy figures for each model. `POST /api/v1/agents/seed` is unauthenticated.
Evidence: `src/HealthQCopilot.Agents/Endpoints/DemoDataEndpoints.cs:29-55`; `src/HealthQCopilot.Agents/Program.cs:406-409`.

## User Stories
- As a clinician or a buyer, I want every accuracy figure I am shown to have been measured, so that I do not trust the product on a number someone typed.
- As a security officer, I want demo and seed routes to be absent from production, so that nobody can write demo data into a live system.

## Requirements
- **FR-001**: A production build MUST contain no endpoint that returns hardcoded metrics.
- **FR-002**: Every model-accuracy figure the product shows MUST come from a recorded evaluation result.
- **FR-003**: A figure with no recorded source MUST be shown as unavailable.
- **FR-004**: Demo and seed endpoints MUST exist only in the Development environment.
- **FR-005**: The seed endpoint MUST be guarded by a named authorization policy wherever it exists.
- **FR-006**: The build MUST fail when a demo endpoint is mapped without an environment check.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a production build, When its endpoints are listed by the architecture test, Then none of the 22 demo endpoints is among them.
- **AC-002** (verifies FR-002): Given the KPI screen, When each accuracy figure is traced by the kit's provenance check, Then each names the evaluation result it came from.
- **AC-003** (verifies FR-003): Given a model with no recorded evaluation, When the KPI screen is opened, Then its accuracy reads as unavailable and no number is shown.
- **AC-004** (verifies FR-004) (abuse case): Given a production deployment, When `POST /api/v1/agents/seed` is called with or without a token, Then the response status is 404.
- **AC-005** (verifies FR-005) (abuse case): Given the Development environment and a caller with no token, When the seed endpoint is called, Then the response status is 401.
- **AC-006** (verifies FR-006): Given a change that maps a demo endpoint with no environment check, When the architecture tests run, Then they fail and name the endpoint.

## Non-Functional Requirements
- **NFR-001**: Each figure on the KPI screen shows the date of the evaluation it came from.

## Risks
- Screens that show these figures today will show "unavailable" until 006 produces real results. That is the honest state.
- Demos that depend on the seed endpoint need a Development environment, or a waiver with an owner and an end date.

## Out of Scope
- Producing the evaluation results (006). Authorization of the other endpoints (002).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): "unavailable" is shown, not a last-known or estimated figure.
- A2 (accepted): no hosted environment keeps the demo endpoints, including environments used for sales demonstrations.

## PHI Involved
None in the figures. The seed endpoint writes synthetic records.

## Access Control
The seed endpoint gains a policy and exists only in Development.

## Audit Controls
Each figure shown traces to a recorded evaluation result with its date and versions.

## Integrity
A production system can no longer be written to by an unauthenticated seed call.

## Authentication
The seed endpoint requires a validated token where it exists. Depends on 001.

## Transmission Security
Not applicable: no channel changes.

## Minimum Necessary
Not applicable: no PHI is read or disclosed.
