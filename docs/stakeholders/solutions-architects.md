# Solutions Architect Guide

This guide is for architecture owners evaluating boundaries, integration style, and deployment strategy.

## Architecture Intent

- Domain-oriented services with isolated data ownership.
- Event-driven collaboration for cross-service workflows.
- Independent frontend domain delivery via Module Federation.
- AI triage with explicit governance and human escalation paths.

## Reference Topology in This Codebase

| Layer | Primary Assets | Notes |
|---|---|---|
| Experience layer | [frontend/apps](../../frontend/apps) | Shell host + 7 remote MFEs |
| API edge | [src/HealthQCopilot.Gateway](../../src/HealthQCopilot.Gateway), [src/HealthQCopilot.BFF](../../src/HealthQCopilot.BFF) | YARP reverse proxy and GraphQL aggregation |
| Domain services | [src](../../src) | Identity, Voice, Agents, FHIR, OCR, Scheduling, Notifications, PopulationHealth, RevenueCycle |
| Shared contracts | [src/HealthQCopilot.Domain](../../src/HealthQCopilot.Domain), [frontend/packages/mfe-events/src/index.ts](../../frontend/packages/mfe-events/src/index.ts) | Domain events and cross-MFE contracts |
| Infrastructure and runtime | [infra](../../infra), [src/HealthQCopilot.AppHost](../../src/HealthQCopilot.AppHost) | Cloud baseline, GitOps assets, local orchestration |

## Architectural Patterns in Use

- DDD boundaries with domain-first modeling.
- Transactional outbox for reliable event publication.
- Shared resilience and observability abstractions through infrastructure layer.
- Backend-for-Frontend pattern for aggregated query paths.
- Typed event contract package for micro frontend coordination.

## Integration Style

1. Prefer asynchronous events for cross-context workflows.
2. Use gateway/BFF for edge composition concerns.
3. Keep schema and persistence ownership inside each context.
4. Maintain strict contract evolution for UI and service boundaries.

## Deployment Strategy Footprint

The repository currently contains both:

- Application CI/CD track for service and frontend deployment workflows:
  - [microservice-deploy.yml](../../.github/workflows/microservice-deploy.yml)
  - [frontend-deploy.yml](../../.github/workflows/frontend-deploy.yml)
  - [helm-chart-validation.yml](../../.github/workflows/helm-chart-validation.yml)
  - [workflow-lint.yml](../../.github/workflows/workflow-lint.yml)
  - [cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml)

- Kubernetes/GitOps baseline assets for platform-level topology:
  - [infra/bicep](../../infra/bicep)
  - [infra/helm](../../infra/helm)
  - [infra/argocd](../../infra/argocd)
  - [infra-deploy.yml](../../.github/workflows/infra-deploy.yml)

## NFR and Control Points

| Concern | Current Control Surface |
|---|---|
| Reliability | Shared resilience handlers and rollout workflows |
| Observability | OpenTelemetry and health endpoints across services |
| Security | PR security scanning, secret scanning, infra security controls |
| Compliance | Dedicated mappings in [docs/compliance](../compliance) |
| Release safety | Post-deploy smoke and cloud E2E gates |

Route ownership reference: [API Route Ownership Map](api-route-ownership-map.md)

## Architecture Review Checklist

- New features map to an existing bounded context or define a new one clearly.
- Data ownership remains single-writer per service.
- Cross-context workflows are event-first and idempotent.
- UI integration contracts remain typed and version-safe.
- Deployment model impact (app CI/CD vs GitOps baseline) is explicit.
