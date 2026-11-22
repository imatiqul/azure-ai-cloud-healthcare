---
spec: 002-endpoint-authorization
touches:
- agent-service
- fhir-service
- identity-service
- lib-infrastructure
- notification-service
- ocr-service
- pophealth-service
- revenue-service
- scheduling-service
- voice-service
affected:
- node: agent-db
  distance: 1
  via: is owned by agent-service
  owner: data-owner
- node: bff
  distance: 1
  via: builds-with lib-infrastructure
  owner: backend
- node: fhir-db
  distance: 1
  via: is owned by fhir-service
  owner: data-owner
- node: gateway
  distance: 1
  via: builds-with lib-infrastructure
  owner: backend
- node: identity-db
  distance: 1
  via: is owned by identity-service
  owner: data-owner
- node: notification-db
  distance: 1
  via: is owned by notification-service
  owner: data-owner
- node: ocr-db
  distance: 1
  via: is owned by ocr-service
  owner: data-owner
- node: pophealth-db
  distance: 1
  via: is owned by pophealth-service
  owner: data-owner
- node: revenue-db
  distance: 1
  via: is owned by revenue-service
  owner: data-owner
- node: scheduling-db
  distance: 1
  via: is owned by scheduling-service
  owner: data-owner
- node: topic-booking.created
  distance: 1
  via: is published by scheduling-service
  owner: solutions-architect
- node: topic-breakglass.granted
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-breakglass.revoked
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-campaign.activated
  distance: 1
  via: is published by notification-service
  owner: solutions-architect
- node: topic-campaign.cancelled
  distance: 1
  via: is published by notification-service
  owner: solutions-architect
- node: topic-campaign.completed
  distance: 1
  via: is published by notification-service
  owner: solutions-architect
- node: topic-care-gap.addressed
  distance: 1
  via: is published by pophealth-service
  owner: solutions-architect
- node: topic-care-gap.closed
  distance: 1
  via: is published by pophealth-service
  owner: solutions-architect
- node: topic-care-gap.identified
  distance: 1
  via: is published by pophealth-service
  owner: solutions-architect
- node: topic-claim.rejected
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-claim.submitted
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-coding-job.submitted
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-consent.granted
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-consent.revoked
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-document.processed
  distance: 1
  via: is published by ocr-service
  owner: solutions-architect
- node: topic-escalation.required
  distance: 1
  via: is published by agent-service
  owner: solutions-architect
- node: topic-identity.break-glass.granted
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-identity.erasure.requested
  distance: 1
  via: is published by identity-service
  owner: solutions-architect
- node: topic-model.drift.detected
  distance: 1
  via: is published by agent-service
  owner: solutions-architect
- node: topic-patient-risk.assessed
  distance: 1
  via: is published by pophealth-service
  owner: solutions-architect
- node: topic-priorauth.result
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-remittance.posted
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-remittance.received
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-revenue.coding-job.created
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-revenue.prior-auth.approved
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-revenue.prior-auth.denied
  distance: 1
  via: is published by revenue-service
  owner: solutions-architect
- node: topic-scheduling.booking.cancelled
  distance: 1
  via: is published by scheduling-service
  owner: solutions-architect
- node: topic-scheduling.booking.rescheduled
  distance: 1
  via: is published by scheduling-service
  owner: solutions-architect
- node: topic-scheduling.slot.booked
  distance: 1
  via: is published by scheduling-service
  owner: solutions-architect
- node: topic-session.ended
  distance: 1
  via: is published by voice-service
  owner: solutions-architect
- node: topic-slot.booked
  distance: 1
  via: is published by scheduling-service
  owner: solutions-architect
- node: topic-transcript.produced
  distance: 1
  via: is published by voice-service
  owner: solutions-architect
- node: topic-triage.completed
  distance: 1
  via: is published by agent-service
  owner: solutions-architect
- node: voice-db
  distance: 1
  via: is owned by voice-service
  owner: data-owner
- node: shell
  distance: 2
  via: calls gateway
  owner: frontend
tier_computed: critical
required_approvers:
  G3:
  - backend
  - data-owner
  - platform
  - security-compliance
  - solutions-architect
  G5:
  - backend
  - platform
  - security-compliance
packs_triggered:
- shared-component
---
# Impact report: 002-endpoint-authorization

Generated by the kit from the system map. Do not edit; regenerate with the impact command.

- **Touches:** agent-service, fhir-service, identity-service, lib-infrastructure, notification-service, ocr-service, pophealth-service, revenue-service, scheduling-service, voice-service
- **Tier from the map:** critical
- **Change packs triggered:** shared-component
- **Must approve the plan (G3):** backend, data-owner, platform, security-compliance, solutions-architect
- **Must approve the implementation (G5):** backend, platform, security-compliance

## Blast radius

| Distance | Node | Type | Owner | Reached because it |
|---|---|---|---|---|
| 1 | agent-db | schema | data-owner | is owned by agent-service |
| 1 | bff | service | backend | builds-with lib-infrastructure |
| 1 | fhir-db | schema | data-owner | is owned by fhir-service |
| 1 | gateway | service | backend | builds-with lib-infrastructure |
| 1 | identity-db | schema | data-owner | is owned by identity-service |
| 1 | notification-db | schema | data-owner | is owned by notification-service |
| 1 | ocr-db | schema | data-owner | is owned by ocr-service |
| 1 | pophealth-db | schema | data-owner | is owned by pophealth-service |
| 1 | revenue-db | schema | data-owner | is owned by revenue-service |
| 1 | scheduling-db | schema | data-owner | is owned by scheduling-service |
| 1 | topic-booking.created | event | solutions-architect | is published by scheduling-service |
| 1 | topic-breakglass.granted | event | solutions-architect | is published by identity-service |
| 1 | topic-breakglass.revoked | event | solutions-architect | is published by identity-service |
| 1 | topic-campaign.activated | event | solutions-architect | is published by notification-service |
| 1 | topic-campaign.cancelled | event | solutions-architect | is published by notification-service |
| 1 | topic-campaign.completed | event | solutions-architect | is published by notification-service |
| 1 | topic-care-gap.addressed | event | solutions-architect | is published by pophealth-service |
| 1 | topic-care-gap.closed | event | solutions-architect | is published by pophealth-service |
| 1 | topic-care-gap.identified | event | solutions-architect | is published by pophealth-service |
| 1 | topic-claim.rejected | event | solutions-architect | is published by revenue-service |
| 1 | topic-claim.submitted | event | solutions-architect | is published by revenue-service |
| 1 | topic-coding-job.submitted | event | solutions-architect | is published by revenue-service |
| 1 | topic-consent.granted | event | solutions-architect | is published by identity-service |
| 1 | topic-consent.revoked | event | solutions-architect | is published by identity-service |
| 1 | topic-document.processed | event | solutions-architect | is published by ocr-service |
| 1 | topic-escalation.required | event | solutions-architect | is published by agent-service |
| 1 | topic-identity.break-glass.granted | event | solutions-architect | is published by identity-service |
| 1 | topic-identity.erasure.requested | event | solutions-architect | is published by identity-service |
| 1 | topic-model.drift.detected | event | solutions-architect | is published by agent-service |
| 1 | topic-patient-risk.assessed | event | solutions-architect | is published by pophealth-service |
| 1 | topic-priorauth.result | event | solutions-architect | is published by revenue-service |
| 1 | topic-remittance.posted | event | solutions-architect | is published by revenue-service |
| 1 | topic-remittance.received | event | solutions-architect | is published by revenue-service |
| 1 | topic-revenue.coding-job.created | event | solutions-architect | is published by revenue-service |
| 1 | topic-revenue.prior-auth.approved | event | solutions-architect | is published by revenue-service |
| 1 | topic-revenue.prior-auth.denied | event | solutions-architect | is published by revenue-service |
| 1 | topic-scheduling.booking.cancelled | event | solutions-architect | is published by scheduling-service |
| 1 | topic-scheduling.booking.rescheduled | event | solutions-architect | is published by scheduling-service |
| 1 | topic-scheduling.slot.booked | event | solutions-architect | is published by scheduling-service |
| 1 | topic-session.ended | event | solutions-architect | is published by voice-service |
| 1 | topic-slot.booked | event | solutions-architect | is published by scheduling-service |
| 1 | topic-transcript.produced | event | solutions-architect | is published by voice-service |
| 1 | topic-triage.completed | event | solutions-architect | is published by agent-service |
| 1 | voice-db | schema | data-owner | is owned by voice-service |
| 2 | shell | frontend | frontend | calls gateway |
