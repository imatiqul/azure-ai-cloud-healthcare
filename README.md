# Azure AI Cloud Healthcare (HealthQ Copilot)

Azure AI Cloud Healthcare, delivered here as HealthQ Copilot, is a distributed healthcare platform built with .NET microservices, React/Vite micro frontends, and AI-assisted triage workflows.

This repository now uses role-specific documentation so each stakeholder can get to the right context quickly.

## Stakeholder Guides

| Stakeholder | Guide | Focus |
|---|---|---|
| Backend engineers | [Backend Engineer Guide](docs/stakeholders/backend-engineers.md) | Domain services, APIs, events, persistence, tests |
| Frontend engineers | [Frontend Engineer Guide](docs/stakeholders/frontend-engineers.md) | MFEs, federation contracts, UI test and release flow |
| AI engineers | [AI Engineer Guide](docs/stakeholders/ai-engineers.md) | Semantic Kernel orchestration, RAG, guardrails, HITL |
| QA engineers | [QA Engineer Guide](docs/stakeholders/qa-engineers.md) | Regression strategy, automation suites, release confidence |
| Security and compliance teams | [Security and Compliance Guide](docs/stakeholders/security-compliance.md) | Security scanning, compliance evidence, release controls |
| SRE and operations teams | [SRE and Operations Guide](docs/stakeholders/sre-operations.md) | Runtime health, incident response, rollback readiness |
| DevOps engineers | [DevOps Engineer Guide](docs/stakeholders/devops-engineers.md) | IaC, pipelines, GitOps, rollout and rollback |
| Platform managers | [Platform Manager Guide](docs/stakeholders/platform-managers.md) | Delivery flow, quality signals, compliance artifacts |
| Solution architects | [Solutions Architect Guide](docs/stakeholders/solutions-architects.md) | System topology, bounded contexts, deployment models |

Full role index: [Stakeholder Documentation Hub](docs/stakeholders/README.md)

## Architecture Snapshot

- Backend runtime: domain services in `src/`, plus API gateway (`src/HealthQCopilot.Gateway`) and GraphQL BFF (`src/HealthQCopilot.BFF`).
- Frontend runtime: shell host plus 7 remotes under `frontend/apps/`.
- Shared frontend contracts: `frontend/packages/mfe-events`, `frontend/packages/graphql-client`, `frontend/packages/web-pubsub-client`.
- Local orchestration: Aspire AppHost (`src/HealthQCopilot.AppHost`) and Docker Compose + Dapr (`docker-compose.yml`, `infra/dapr`).
- Delivery tracks currently present in repo:
  - Azure Container Apps + Static Web Apps pipelines for application deploys.
  - AKS + Helm + ArgoCD/Argo Rollouts infrastructure baseline.

## Repository Layout

```text
healthcare-ai/
|- src/                  # .NET services, domain, infrastructure, gateway, BFF, app host
|- frontend/             # Turborepo monorepo (8 MFEs + shared packages)
|- infra/                # Bicep, Helm, ArgoCD, Dapr, K8s policies
|- tests/                # Unit and integration test projects
|- docs/                 # Stakeholder guides, diagrams, exports, compliance
`- .github/workflows/    # CI/CD and quality gates
```

## Quick Start (All Engineers)

### Prerequisites

- .NET 9 SDK + Aspire workload (`dotnet workload install aspire`)
- Docker Desktop (Compose v2)
- Dapr CLI
- Node.js 20+ and pnpm 9+

### Start the Platform Locally

```bash
# Start backend services + infra using Aspire
dotnet run --project src/HealthQCopilot.AppHost
```

```bash
# In a second terminal, start all frontend apps
cd frontend
pnpm install
pnpm dev
```

### Run Tests

```bash
# Backend
dotnet test tests/HealthQCopilot.Tests.Unit
dotnet test tests/HealthQCopilot.Tests.Integration

# Frontend
cd frontend
pnpm test
pnpm test:e2e
```

## Delivery and Quality Pipelines

| Workflow | Purpose |
|---|---|
| `.github/workflows/pr-validation.yml` | PR quality gates for .NET and frontend |
| `.github/workflows/microservice-deploy.yml` | Service build, security scan, image push, and deploy |
| `.github/workflows/frontend-deploy.yml` | MFE build and Azure Static Web Apps deployment |
| `.github/workflows/infra-deploy.yml` | Bicep validation and infrastructure deployment |
| `.github/workflows/cloud-e2e-tests.yml` | Post-deploy smoke and full cloud E2E validation |
| `.github/workflows/rollback.yml` | Manual rollback workflow |

## Demo Diagrams and Visual Assets

- [Diagram Library](docs/diagrams/README.md) for technical, investor-friendly, and LinkedIn carousel Mermaid source files.
- [SVG Exports](docs/diagrams/exports/svg) for deck-friendly vector assets.
- [PNG Exports](docs/diagrams/exports/png) for social posts, docs, and slide embeds.

## Additional Documentation

- [Training Course Hub](docs/training/README.md)
- [Stakeholder Documentation Hub](docs/stakeholders/README.md)
- [Diagrams Index](docs/diagrams/README.md)
- [Helm Notes](infra/helm/README.md)
- [Compliance Documentation](docs/compliance)
- [Workflow Catalog](.github/workflows)

## License

Proprietary - all rights reserved.
