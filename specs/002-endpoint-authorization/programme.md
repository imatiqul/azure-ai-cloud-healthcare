# Programme breakdown: every endpoint is authorized and scoped (002, finding C2)

- **Phase and date:** Phase 6, 2026-11-22. A proposal, waiting for the owner. Depth for the reference: impact report and breakdown only; nothing here is implemented or planned further
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-14
- **Assumptions:** B1 to B3 under "Decisions this breakdown makes"
- **Unverified:** the counts are from patterns run over the source on 2026-11-22. They match the totals of Phase 1 (243 minimal API endpoints, 20 controller actions). Nothing was built or run

## Why one spec is not enough

The spec touches the shared infrastructure library and nine services. Its impact report reaches 45 other components. By the Phase 1 counts about 244 of 263 endpoints change behaviour. One pull request for that cannot be reviewed, and one release of it cannot be rolled back a service at a time.

## The children

One child per service, and one before them all for what they share. Each child is a spec of its own, with its own G1 to G7. The parent keeps the requirements; each child meets them for its service.

| Proposed child | Touches | Endpoints (minimal API + controller) | Authorization calls today | Owner role |
|---|---|---|---|---|
| `026-authz-policy-set` | lib-infrastructure | none of its own | — | platform |
| `027-authz-identity` | identity-service | 27 + 0 | 5 | backend |
| `028-authz-voice` | voice-service | 9 + 0 | 1 | backend |
| `029-authz-scheduling` | scheduling-service | 21 + 1 | 0 | backend |
| `030-authz-revenue` | revenue-service | 25 + 2 | 0 | backend |
| `031-authz-ocr` | ocr-service | 4 + 0 | 1 | backend |
| `032-authz-agents` | agent-service | 74 + 7 | 0 | backend |
| `033-authz-fhir` | fhir-service | 59 + 1 | 0 | backend |
| `034-authz-pophealth` | pophealth-service | 14 + 3 | 0 | backend |
| `035-authz-notifications` | notification-service | 10 + 6 | 3 | backend |

`026` holds what every service uses: the named policies, the tenant and patient scoping helpers, the architecture test that lists endpoints, and the generator of the authorization matrix. The nine others apply them: a policy on every endpoint or an allowlist entry, scoping on every read of patient data, and the matrix rows for that service.

## The shared contract

The children agree on one thing: the authorization matrix, generated from the code (NFR-002 of the spec). It lists, for each endpoint, the policy that guards it, whether it is tenant-scoped and patient-scoped, and the allowlist entry if it has no policy. Proposed as a contract on the system map, `contract-authorization-matrix`, owned by Security and Compliance. The gateway and the BFF are its consumers: they forward what the services will check.

## Rollout order

From the system map, providers before the services that call them or read their events:

026, then 027 (identity), 028 (voice), 032 (agents), 029 (scheduling), 030 (revenue), 031 (OCR), 033 (FHIR), 034 (population health), 035 (notifications). The agent service goes before scheduling and revenue because they read its events.

Each service is released on its own. A service that has its policies is safe beside one that does not yet: the gateway already requires a token on every route, so the exposure in between is what it is today, one service smaller each time.

## What the parent's front matter would say

This is an amendment to an approved spec. It is written here, not in the spec:

```yaml
programme:
  children:
    - {spec: 026-authz-policy-set}
    - {spec: 027-authz-identity}
    - {spec: 028-authz-voice}
    - {spec: 029-authz-scheduling}
    - {spec: 030-authz-revenue}
    - {spec: 031-authz-ocr}
    - {spec: 032-authz-agents}
    - {spec: 033-authz-fhir}
    - {spec: 034-authz-pophealth}
    - {spec: 035-authz-notifications}
  contract: contract-authorization-matrix
  rollout: [026-authz-policy-set, 027-authz-identity, 028-authz-voice, 032-authz-agents, 029-authz-scheduling, 030-authz-revenue, 031-authz-ocr, 033-authz-fhir, 034-authz-pophealth, 035-authz-notifications]
```

The kit's programme check then requires each child to exist, to name this spec as its parent, the contract to be on the map, and the rollout to include every child.

## Decisions this breakdown makes
- B1: one child per service, not per kind of endpoint. A service is what is deployed and rolled back.
- B2: the agent service has 81 endpoints and no authorization call. It is the largest child and may need splitting again by endpoint group when it is specified.
- B3: the children come after 001 and 003 in the order. Policies need a real identity and a tenant taken from the token.

## Found while breaking this down
1. Phase 1 counted 12 authorization calls. The pattern used here counts 13; one is inside a comment.
2. Two findings made while planning 004 belong to this programme's subject and are not in it: the idempotency middleware answers repeated requests before authorization, and the consent middleware never runs its check. They are in `004-audit-identity/plan.md`.
