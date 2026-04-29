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
| `api-route-ownership-governance.yml` | `pull_request` for gateway route config/map paths | Enforces route ownership map updates and route-to-cluster alignment with gateway config. |
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
| `cloud-e2e-tests.yml` | `workflow_run` after deploy workflows, `schedule`, `workflow_dispatch` | Live cloud smoke and full E2E validation gates with endpoint override inputs and diagnostics artifact bundles for smoke/full runs. |
| `cloud-e2e-regression.yml` | `workflow_run` after `cloud-e2e-tests.yml`, `workflow_dispatch` | Extended cloud regression validation and coverage checks. |
| `runtime-convergence-audit.yml` | `schedule`, `workflow_dispatch` | Audits Phase 1 runtime convergence criteria (consecutive cloud E2E success + route probe health). |
| `gateway-route-probes.yml` | `workflow_run` after deploy workflows, `schedule`, `workflow_dispatch` | Gateway route ownership probes and non-404/non-405 route integrity checks. |
| `deployment-health.yml` | `workflow_run` after `cloud-e2e-tests.yml`, `schedule`, `workflow_dispatch` | Deployment-health aggregation and post-deploy checks. |
| `compliance-check.yml` | `schedule`, `workflow_dispatch` | Security and compliance scanning/reporting checks. |
| `release-gate-policy-audit.yml` | `schedule`, `workflow_dispatch` | Audits `main` branch protection and release gate policy compliance from `.github/release-gate-policy.json`. |
| `weekly-platform-scorecard.yml` | `schedule`, `workflow_dispatch` | Generates weekly workflow pass-rate scorecard with rollback cadence and MTTR KPI snapshot artifact. |
| `rollback-drill-readiness.yml` | `schedule`, `workflow_dispatch` | Evaluates rollback drill cadence and MTTR readiness thresholds and publishes readiness artifact. |
| `dora-metrics.yml` | `schedule`, `workflow_dispatch` | Calculates the four DORA metrics (deployment frequency, lead time, change failure rate, MTTR) and publishes artifact. |
| `slo-error-budget.yml` | `schedule`, `workflow_dispatch` | Computes availability SLI from Cloud E2E and route probe run history; alerts when 28-day error budget < 20% remaining. |
| `release-readiness-orchestrator.yml` | `schedule`, `workflow_dispatch` | Aggregates required gate workflows by environment tier (dev/staging/production) and emits a single release go/no-go decision. Optionally opens a triage issue on failure. |
| `environment-promotion.yml` | `push` to `main`, `workflow_dispatch` | Dev → Staging → Production promotion pipeline with automated quality gate checks, environment-protected production approval, and release-readiness orchestrator enforcement. |
| `security-scorecard.yml` | `push` to `main`, `schedule`, `workflow_dispatch` | OpenSSF Scorecard supply-chain hygiene check and CodeQL SAST for C# and JavaScript/TypeScript. |
| `chaos-readiness.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Audits Helm values for readiness/liveness probes, resource requests/limits, and replica redundancy across all 10 services. |
| `cost-governance.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Audits service resource requests/limits against approved budget thresholds; flags over-budget or misconfigured values. |
| `dependency-freshness.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Scans all workflow files for floating mutable-branch action pins (supply-chain risk), stale major versions, and deprecated Node runtime references. |
| `api-contract-drift.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Detects breaking OpenAPI/Swagger spec changes (removed operations) in PRs; governs spec file presence for all 10 services. |
| `credential-hygiene.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Scans all source files for hardcoded credential patterns (connection strings, private keys, API keys, FHIR secrets). HIPAA-critical control. |
| `service-health-governance.yml` | `schedule`, `pull_request`, `workflow_dispatch` | Audits Helm Deployment templates for livenessProbe/readinessProbe and verifies health check endpoint registration in each service's Program.cs. |

## Artifact Notes

- `helm-chart-validation.yml` uploads artifact `helm-rendered-manifests` containing:
  - `artifacts/helm/healthq-copilot-dev.yaml`
  - `artifacts/helm/healthq-copilot-prod.yaml`
- `infra-deploy.yml` validate job uploads `helm-rendered-<env>` from `/tmp/healthq-copilot.rendered.yaml`.
- `cloud-e2e-tests.yml` uploads `cloud-e2e-report-<run>`, `cloud-e2e-results-json-<run>`, `cloud-e2e-smoke-diagnostics-<run>`, and `cloud-e2e-diagnostics-<run>` (endpoint matrix + raw Playwright diagnostics).
- `runtime-convergence-audit.yml` uploads `runtime-convergence-<date>` with Phase 1 exit-criteria audit outcomes.
- `gateway-route-probes.yml` writes route probe outcomes to the job summary and fails when critical routes regress.
- `release-gate-policy-audit.yml` uploads `release-gate-audit-<date>` with branch protection and post-merge gate compliance results.
- `rollback-drill-readiness.yml` uploads `rollback-readiness-<date>` with cadence and MTTR readiness evaluation.
- `dora-metrics.yml` uploads `dora-metrics-<date>` with the four DORA key metrics (90-day retention).
- `slo-error-budget.yml` uploads `slo-error-budget-<date>` with SLI, error budget, and per-workflow breakdown (90-day retention).
- `security-scorecard.yml` uploads `openssf-scorecard-<run-id>` SARIF and also uploads to the GitHub Security tab via SARIF upload.
- `chaos-readiness.yml` uploads `chaos-readiness-<date>` with per-service probe and resource resilience audit results (60-day retention).
- `cost-governance.yml` uploads `cost-governance-<date>` with per-service resource budget compliance table (90-day retention).
- `dependency-freshness.yml` uploads `dependency-freshness-<date>` with floating pin, stale version, and Node deprecation findings (90-day retention).
- `api-contract-drift.yml` uploads `api-contract-drift-<date>` with spec coverage and PR breaking-change analysis (90-day retention).
- `credential-hygiene.yml` uploads `credential-hygiene-<date>` with HIGH and MEDIUM credential pattern findings (60-day retention).
- `service-health-governance.yml` uploads `service-health-governance-<date>` with per-service probe and health endpoint compliance table (60-day retention).
- `infra-deploy.yml` validate job also uploads `release-evidence-<env>-<sha>` release checklist artifact.
- `frontend-deploy.yml` uploads `swa-deploy-evidence-<app>-<sha>` per-MFE deploy evidence artifact.

## Environment URL Variables

Cloud validation workflows support environment-specific URL overrides through repository variables and workflow-dispatch inputs.
The primary repository variables are:

- `HEALTHQ_API_BASE_URL`
- `HEALTHQ_GATEWAY_ACA_URL`
- `HEALTHQ_SHELL_URL`
- `HEALTHQ_VOICE_URL`
- `HEALTHQ_TRIAGE_URL`
- `HEALTHQ_SCHEDULING_URL`
- `HEALTHQ_POPHEALTH_URL`
- `HEALTHQ_REVENUE_URL`
- `HEALTHQ_ENCOUNTERS_URL`
- `HEALTHQ_ENGAGEMENT_URL`

Resolution order in parameterized workflows is: workflow-dispatch input -> repository variable -> baked-in fallback default.

## Local Validation Tip

You can lint workflows locally without installing actionlint on your host:

```bash
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/*.yml
```
