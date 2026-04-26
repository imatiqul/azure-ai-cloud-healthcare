# API Route Ownership Map

This document is the canonical route ownership reference for public gateway-exposed APIs.

Source of truth:
- Gateway route definitions in `src/HealthQCopilot.Gateway/appsettings.json`.
- Service destination mapping in `src/HealthQCopilot.Gateway/appsettings.Production.json`.

## Public Route Prefix Ownership

| Public Route Prefix | Owning Service | Gateway Cluster ID | Notes |
|---|---|---|---|
| /api/v1/agents/{**catch-all} | Agents | agent-service | AI triage, governance, workflow operations |
| /api/v1/voice/{**catch-all} | Voice | voice-service | Voice sessions and transcript APIs |
| /api/webpubsub/{**catch-all} | Voice | voice-service | Web PubSub negotiation path |
| /api/v1/scheduling/{**catch-all} | Scheduling | scheduling-service | Slots, bookings, waitlist, practitioner APIs |
| /api/v1/population-health/{**catch-all} | Population Health | pophealth-service | Risk, care gap, cohort analytics |
| /api/v1/revenue/{**catch-all} | Revenue Cycle | revenue-service | Coding, prior auth, denials, claims |
| /api/v1/fhir/{**catch-all} | FHIR | fhir-service | FHIR API surface |
| /fhir/metadata | FHIR | fhir-service | FHIR capability statement route |
| /.well-known/{**catch-all} | FHIR | fhir-service | SMART on FHIR/OIDC discovery paths |
| /api/v1/identity/{**catch-all} | Identity | identity-service | Users, consent, break-glass, authz admin |
| /api/v1/admin/audit/{**catch-all} | Identity | identity-service | PHI/admin audit APIs |
| /api/v1/notifications/{**catch-all} | Notifications | notification-service | Campaigns, delivery, messaging |
| /api/v1/ocr/{**catch-all} | OCR | ocr-service | OCR jobs and extraction APIs |

## Change Protocol

1. If gateway route ownership changes, update this file in the same PR.
2. If a route prefix moves between services, include migration notes in PR description.
3. For route additions/removals, re-run cloud smoke probes and verify no 404/405 regressions.
4. For `infra/helm` or workflow changes, include corresponding CI evidence artifacts.
