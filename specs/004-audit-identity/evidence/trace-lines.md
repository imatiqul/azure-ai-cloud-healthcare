# From a changed line to the principle, and to what the change reaches

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** TRC-19, MAP-10
- **Assumptions:** none
- **Unverified:** the commit ids below are those of the workspace the change was written in; the same commits on another machine have other ids. "Approvals: none recorded yet" is true: no gate of this spec has a decision record

Each row is one line this change wrote, traced with `agentic.py why <file>:<line>`. The command reads the commit that last changed the line, the work item that commit names, the criteria that task carries, the requirements they verify, the principle the spec is held to, and the component the file belongs to on the system map.

| Line | Task | Agent | Criteria | Requirements | Principle | Component |
|---|---|---|---|---|---|---|
| `src/HealthQCopilot.Agents/Program.cs:391` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | agent-service |
| `src/HealthQCopilot.Fhir/Program.cs:86` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | fhir-service |
| `src/HealthQCopilot.Identity/Program.cs:65` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | identity-service |
| `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs:162` | T001 | backend-implementer | AC-002, AC-003, AC-004 | FR-002, FR-003 | P-9 | event-hubs-audit |
| `src/HealthQCopilot.Notifications/Program.cs:57` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | notification-service |
| `src/HealthQCopilot.Ocr/Program.cs:48` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | ocr-service |
| `src/HealthQCopilot.PopulationHealth/Program.cs:74` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | pophealth-service |
| `src/HealthQCopilot.RevenueCycle/Program.cs:64` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | revenue-service |
| `src/HealthQCopilot.Scheduling/Program.cs:57` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | scheduling-service |
| `src/HealthQCopilot.Voice/Program.cs:58` | T002 | backend-implementer | AC-001 | FR-001 | P-9 | voice-service |
| `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrder.cs:1` | T004 | test-agent | AC-001, AC-005 | FR-001, FR-004 | P-9 | - |
| `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrderTests.cs:1` | T004 | test-agent | AC-001, AC-005 | FR-001, FR-004 | P-9 | - |
| `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs:477` | T003 | test-agent | AC-002, AC-003, AC-004 | FR-002, FR-003 | P-9 | - |
| `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditPipelineTests.cs:1` | T003 | test-agent | AC-002, AC-003, AC-004 | FR-002, FR-003 | P-9 | - |

The four test files belong to no component: the map indexes no test folder.

## One line of the middleware, in full

```
# Why `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs:162` is the way it is

- **Last changed:** 2026-11-22 in `d5902a2c1b` by agentic-kit, agent backend-implementer
- **Work item:** 004-audit-identity/T001

## Spec 004-audit-identity: Audit records name the authenticated user
- **Task T001 carries:** AC-002, AC-003, AC-004
- **FR-002:** An audit record MUST carry the user identifier from the validated token of the request it describes.
- **FR-003:** A request to an audited path that is refused for lack of a valid token MUST still produce an audit record, marked as unauthenticated.
- **Principle P-9:** Every access to PHI is attributed
- **Component:** `event-hubs-audit` (event-stream, owner security-compliance, tier critical)
- **The spec touches:** `agent-service`, `fhir-service`, `identity-service`, `lib-infrastructure`, `notification-service`, `ocr-service`, `pophealth-service`, `revenue-service`, `scheduling-service`, `voice-service`
- **The spec depends on:** `phi-audit-logs` (schema-object), `event-hubs-audit` (event-stream), `entra-id` (external-service)
- **Reaches data stores (9):** `agent-db`, `fhir-db`, `identity-db`, `notification-db`, `ocr-db`, `pophealth-db`, `revenue-db`, `scheduling-db`, `voice-db`
- **Reaches contracts and events (33):** `topic-booking.created`, `topic-breakglass.granted`, `topic-breakglass.revoked`, `topic-campaign.activated`, `topic-campaign.cancelled`, `topic-campaign.completed`, `topic-care-gap.addressed`, `topic-care-gap.closed`, `topic-care-gap.identified`, `topic-claim.rejected`, `topic-claim.submitted`, `topic-coding-job.submitted`, `topic-consent.granted`, `topic-consent.revoked`, `topic-document.processed`, `topic-escalation.required`, `topic-identity.break-glass.granted`, `topic-identity.erasure.requested`, `topic-model.drift.detected`, `topic-patient-risk.assessed`, `topic-priorauth.result`, `topic-remittance.posted`, `topic-remittance.received`, `topic-revenue.coding-job.created`, `topic-revenue.prior-auth.approved`, `topic-revenue.prior-auth.denied`, `topic-scheduling.booking.cancelled`, `topic-scheduling.booking.rescheduled`, `topic-scheduling.slot.booked`, `topic-session.ended`, `topic-slot.booked`, `topic-transcript.produced`, `topic-triage.completed`
- **Reaches applications and other components (3):** `bff`, `gateway`, `shell`
- **Approvals:** none recorded yet
```

## One line of a service, in full

```
# Why `src/HealthQCopilot.Fhir/Program.cs:86` is the way it is

- **Last changed:** 2026-11-22 in `3d5e82aba2` by agentic-kit, agent backend-implementer
- **Work item:** 004-audit-identity/T002

## Spec 004-audit-identity: Audit records name the authenticated user
- **Task T002 carries:** AC-001
- **FR-001:** Each service MUST run the PHI audit middleware after authentication in its request pipeline.
- **Principle P-9:** Every access to PHI is attributed
- **Component:** `fhir-service` (service, owner backend, tier critical)
- **The spec touches:** `agent-service`, `fhir-service`, `identity-service`, `lib-infrastructure`, `notification-service`, `ocr-service`, `pophealth-service`, `revenue-service`, `scheduling-service`, `voice-service`
- **The spec depends on:** `phi-audit-logs` (schema-object), `event-hubs-audit` (event-stream), `entra-id` (external-service)
- **Reaches data stores (9):** `agent-db`, `fhir-db`, `identity-db`, `notification-db`, `ocr-db`, `pophealth-db`, `revenue-db`, `scheduling-db`, `voice-db`
- **Reaches contracts and events (33):** `topic-booking.created`, `topic-breakglass.granted`, `topic-breakglass.revoked`, `topic-campaign.activated`, `topic-campaign.cancelled`, `topic-campaign.completed`, `topic-care-gap.addressed`, `topic-care-gap.closed`, `topic-care-gap.identified`, `topic-claim.rejected`, `topic-claim.submitted`, `topic-coding-job.submitted`, `topic-consent.granted`, `topic-consent.revoked`, `topic-document.processed`, `topic-escalation.required`, `topic-identity.break-glass.granted`, `topic-identity.erasure.requested`, `topic-model.drift.detected`, `topic-patient-risk.assessed`, `topic-priorauth.result`, `topic-remittance.posted`, `topic-remittance.received`, `topic-revenue.coding-job.created`, `topic-revenue.prior-auth.approved`, `topic-revenue.prior-auth.denied`, `topic-scheduling.booking.cancelled`, `topic-scheduling.booking.rescheduled`, `topic-scheduling.slot.booked`, `topic-session.ended`, `topic-slot.booked`, `topic-transcript.produced`, `topic-triage.completed`
- **Reaches applications and other components (3):** `bff`, `gateway`, `shell`
- **Approvals:** none recorded yet
```

Forward, the trace names what the spec touches, what it says it depends on (the audit table, the audit event stream and the identity provider) and what the map says a change to those components reaches. It reaches further than this change does: no event topic and no service database is altered by it. The two stores the change does alter, by the values it writes, are the ones listed under "depends on".
