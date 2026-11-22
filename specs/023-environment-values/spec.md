---
spec: 023-environment-values
finding: N7
tier_declared: critical
owner_role: devops-sre
principles: [P-24]
touches: [gateway]
depends_on:
  nodes: [key-vault, azure-app-configuration]
  specs: [001-fail-closed-auth, 022-cors-allowlist]
---
# Feature Specification: Values that belong to one environment are not in tracked files

- **Phase and date:** Phase 5, batch 4, 2026-11-22. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 and A2 under "Questions for G2". The finding is rated Low; the tier here is Critical because a spec's tier may not be lower than that of a component it changes
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and file listings on 2026-11-22

## Finding
N7, found in Phase 1. The production gateway configuration, a tracked file, holds the tenant identifier, the client identifier and internal hostnames. They are not secrets, but they are values of one environment kept in source.
Evidence: `src/HealthQCopilot.Gateway/appsettings.Production.json:2-7, 81`.

## User Stories
- As an operator, I want an environment's values to live with that environment, so that pointing a build at another environment is a configuration change and not a commit.

## Requirements
- **FR-001**: A value that belongs to one hosted environment MUST come from that environment's configuration store.
- **FR-002**: A tracked configuration file MUST contain no tenant identifier, client identifier or internal hostname of a hosted environment.
- **FR-003**: The pipeline MUST fail when a tracked file gains such a value.
- **FR-004**: The gateway MUST refuse to start when a required environment value is missing.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a Production deployment, When the gateway reads its identity and routing settings, Then they come from the environment's configuration store.
- **AC-002** (verifies FR-002): Given the tracked configuration files after the change, When they are searched for the identifiers and hostnames named in the finding, Then none is found.
- **AC-003** (verifies FR-003): Given a change that adds a hosted environment's hostname to a tracked file, When the pipeline runs, Then it fails and names the file.
- **AC-004** (verifies FR-004): Given a deployment with a required value missing from the configuration store, When the gateway starts, Then it exits with a message that names the value.

## Non-Functional Requirements
- **NFR-001**: No secret is involved; secret references stay in the key vault as they are.

## Risks
- The values remain in the repository's history. They are identifiers, not secrets, so history is not rewritten.
- A deployment that forgets to set a value now fails to start, which 001 already requires for identity settings.

## Out of Scope
- Secrets (already in the key vault). CORS (022).

## Questions for G2
- A1 (assumed): the configuration store is the one the map already names, Azure App Configuration.
- A2 (assumed): history is not rewritten.

## PHI Involved
None.

## Access Control
Not applicable: this spec changes nothing here.

## Audit Controls
Not applicable: this spec changes nothing here.

## Integrity
Not applicable: this spec changes nothing here.

## Authentication
The identity settings the gateway validates tokens against move to the environment's configuration store. Their absence stops the gateway (001).

## Transmission Security
Not applicable: this spec changes nothing here.

## Minimum Necessary
Not applicable: this spec changes nothing here.
