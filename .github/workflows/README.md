# Workflow Catalog

This catalog describes all CI/CD and quality workflows in this repository.

## How To Read This Catalog

- Trigger types: `pull_request`, `push`, `workflow_run`, `schedule`, `workflow_dispatch`.
- Most workflows also support manual execution via `workflow_dispatch`.
- Path-filtered workflows run only when matching files change.

## Quality And PR Gates

| Workflow File | Trigger | Primary Responsibility |
|---|---|---|
| `pr-validation.yml` | `pull_request` on `main` | Baseline PR gate for .NET and frontend quality checks. |
| `workflow-lint.yml` | `pull_request` for `.github/workflows/**` | Lints changed GitHub Actions workflow files with `actionlint` in Docker. |
| `helm-chart-validation.yml` | `pull_request` for `infra/helm/**` and related workflow files | Lints and renders Helm chart for dev and production values; uploads rendered manifests. |
| `chromatic.yml` | `pull_request` and `push` with frontend/design-system path filters | Visual regression checks for Storybook/design system surfaces. |
| `lighthouse-ci.yml` | `pull_request` for frontend paths | Core Web Vitals and Lighthouse quality checks. |
| `e2e-tests.yml` | `pull_request` and `push` for frontend paths | Frontend E2E test validation in CI. |

## Deployment Workflows

| Workflow File | Trigger | Primary Responsibility |
|---|---|---|
| `microservice-deploy.yml` | `push` on `main`, `workflow_dispatch` | Build, test, scan, publish, and deploy backend services. |
| `frontend-deploy.yml` | `push` and `pull_request` for frontend paths | Build and deploy frontend MFEs. |
| `infra-deploy.yml` | `workflow_dispatch` | Validate and deploy Bicep infrastructure; bootstrap AKS platform components. |
| `rollback.yml` | `workflow_dispatch` | Emergency rollback for one service or all services, followed by health, live-seed, and route smoke probe verification. |

## Post-Deploy Validation And Reporting

| Workflow File | Trigger | Primary Responsibility |
|---|---|---|
| `cloud-e2e-tests.yml` | `workflow_run` after deploy workflows, `schedule`, `workflow_dispatch` | Live cloud smoke and full E2E validation gates. |
| `cloud-e2e-regression.yml` | `workflow_run` after `cloud-e2e-tests.yml`, `workflow_dispatch` | Extended cloud regression validation and coverage checks. |
| `deployment-health.yml` | `workflow_run` after `cloud-e2e-tests.yml`, `schedule`, `workflow_dispatch` | Deployment-health aggregation and post-deploy checks. |
| `compliance-check.yml` | `schedule`, `workflow_dispatch` | Security and compliance scanning/reporting checks. |
| `weekly-platform-scorecard.yml` | `schedule`, `workflow_dispatch` | Generates weekly workflow pass-rate scorecard and KPI snapshot artifact. |

## Artifact Notes

- `helm-chart-validation.yml` uploads artifact `helm-rendered-manifests` containing:
  - `artifacts/helm/healthq-copilot-dev.yaml`
  - `artifacts/helm/healthq-copilot-prod.yaml`
- `infra-deploy.yml` validate job uploads `helm-rendered-<env>` from `/tmp/healthq-copilot.rendered.yaml`.

## Local Validation Tip

You can lint workflows locally without installing actionlint on your host:

```bash
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/*.yml
```
