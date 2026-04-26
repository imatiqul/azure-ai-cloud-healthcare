# DevOps Engineer Guide

This guide is for engineers operating deployment pipelines, infrastructure, and runtime reliability.

## Deployment Models in This Repo

Two deployment tracks coexist in the current codebase:

1. Application delivery track (active CI/CD)
   - Service deploy pipeline: [.github/workflows/microservice-deploy.yml](../../.github/workflows/microservice-deploy.yml)
   - Frontend deploy pipeline: [.github/workflows/frontend-deploy.yml](../../.github/workflows/frontend-deploy.yml)
   - Post-deploy validation: [.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml)

2. Platform baseline track (GitOps + Kubernetes assets)
   - IaC: [infra/bicep](../../infra/bicep)
   - Helm chart: [infra/helm](../../infra/helm)
   - ArgoCD applications and rollouts: [infra/argocd](../../infra/argocd)
   - Infra deploy workflow: [.github/workflows/infra-deploy.yml](../../.github/workflows/infra-deploy.yml)

## DevOps Code Map

| Area | Path | Purpose |
|---|---|---|
| Subscription-scoped infrastructure | [infra/bicep/main.bicep](../../infra/bicep/main.bicep) | Core Azure baseline modules |
| Module library | [infra/bicep/modules](../../infra/bicep/modules) | Network, compute, data, monitoring, identities |
| Helm packaging | [infra/helm](../../infra/helm) | Workload templates and values sets |
| GitOps app definitions | [infra/argocd](../../infra/argocd) | ArgoCD app and rollout resources |
| API route ownership map | [api-route-ownership-map.md](api-route-ownership-map.md) | Canonical gateway route-to-service ownership reference |
| Local dependency topology | [docker-compose.yml](../../docker-compose.yml) | Local infra bootstrap for developers |
| Secret consumers | [.github/workflows](../../.github/workflows) | Workflow-level secret references and required keys |

## Pipeline Responsibilities

| Workflow | Responsibility |
|---|---|
| [pr-validation.yml](../../.github/workflows/pr-validation.yml) | CI quality gates on pull requests |
| [microservice-deploy.yml](../../.github/workflows/microservice-deploy.yml) | Build, scan, publish, and deploy service images |
| [frontend-deploy.yml](../../.github/workflows/frontend-deploy.yml) | Build and deploy changed MFEs |
| [infra-deploy.yml](../../.github/workflows/infra-deploy.yml) | Validate and deploy infrastructure baseline — uploads `helm-rendered-<env>` and `release-evidence-<env>-<sha>` artifacts |
| [helm-chart-validation.yml](../../.github/workflows/helm-chart-validation.yml) | Lint and render Helm chart changes on PRs and publish rendered manifests |
| [workflow-lint.yml](../../.github/workflows/workflow-lint.yml) | Lint changed GitHub Actions workflow files in PRs using actionlint |
| [api-route-ownership-governance.yml](../../.github/workflows/api-route-ownership-governance.yml) | Enforce gateway route ownership map updates and route-to-cluster alignment on PRs |
| [release-gate-policy-audit.yml](../../.github/workflows/release-gate-policy-audit.yml) | Audit branch protection required checks and release gate policy compliance |
| [deployment-health.yml](../../.github/workflows/deployment-health.yml) | Health checks after deployment |
| [rollback.yml](../../.github/workflows/rollback.yml) | Controlled rollback execution |

## Operations Quick Commands

### Local infra bootstrap

```bash
docker compose up -d
```

### Validate infrastructure as code

```bash
az bicep build --file infra/bicep/main.bicep
az deployment sub validate \
  --location eastus2 \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/main.dev.bicepparam
```

### Manual infrastructure deployment

```bash
az deployment sub create \
  --location eastus2 \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/main.prod.bicepparam
```

### Trigger cloud E2E validation

Run [.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml) after major service or frontend changes.

## Reliability and Security Checklist

- Deployment uses immutable image tags and published provenance/SBOM where configured.
- Trivy and secret scanning gates are passing before rollout.
- Rollout strategy and health probes align with service risk profile.
- Rollback path is validated and documented for release windows.
- Required deploy secrets and federated credentials are available.
