# Platform Next Phases - April 26, 2026

This roadmap defines the next execution phases after foundational scaffolding, CI workflow hardening, and workflow-catalog documentation updates.

## Phase 1 - Runtime Convergence (0 to 48 hours)

Goal: make cloud runtime state match source-of-truth route and deployment configuration.

Status:
- Runtime convergence audit automation implemented via `.github/workflows/runtime-convergence-audit.yml` with checks for consecutive Cloud E2E success and gateway route probe health.

Key work:
- Correct Azure OIDC federation subject for GitHub Actions deploy identity.
- Run targeted redeploy for runtime-drift services (`identity`, `ai-agent`, `scheduling`, `notification`, `revenue`).
- Re-run cloud smoke and full cloud E2E after redeploy completes.
- Verify gateway/APIM route probes for critical paths (including trailing-slash variants) are non-404/non-405.

Exit criteria:
- `cloud-e2e-tests.yml` full suite succeeds on 2 consecutive `main` runs.
- No critical route probe reports 404 or 405.

## Phase 2 - Release Gate Enforcement (Week 1)

Goal: convert newly added quality checks into mandatory release evidence.

Status:
- Enforcement audit automation implemented via `.github/workflows/release-gate-policy-audit.yml` using `.github/release-gate-policy.json`.
- Release evidence checklist artifact generated and uploaded by `.github/workflows/infra-deploy.yml` validate job as `release-evidence-<env>-<sha>`.

Key work:
- Make `workflow-lint.yml` and `helm-chart-validation.yml` required PR checks.
- Keep `pr-validation.yml` and cloud smoke gate as required checks for production-bound merges.
- Add release checklist reference to workflow artifacts (`helm-rendered-manifests`, infra rendered output).

Exit criteria:
- PR merge path is blocked when workflow-lint or Helm validation fails.
- Release checklist references artifact evidence and is used in at least one production candidate run.

## Phase 3 - Evidence And Scorecards (Week 1 to Week 2)

Goal: publish evidence-driven reliability signals for leadership and release management.

Status:
- Initial automation implemented via `.github/workflows/weekly-platform-scorecard.yml` (scheduled + manual scorecard generation).
- Route integrity trend automation implemented via `.github/workflows/gateway-route-probes.yml` and surfaced in weekly scorecard KPIs.

Key work:
- Generate weekly summary from workflow outcomes (deploy, smoke, full E2E, compliance).
- Track route-probe pass/fail trend and deployment failure rate.
- Publish scorecard links in stakeholder documentation.

Exit criteria:
- Weekly scorecard generated for at least 2 consecutive weeks.
- Platform review uses scorecard data instead of static completion claims.

## Phase 4 - Contract Governance (Week 2 to Week 3)

Goal: reduce route drift and ownership ambiguity.

Status:
- Initial controls implemented: canonical route map (`docs/stakeholders/api-route-ownership-map.md`) and PR contract checklist (`.github/pull_request_template.md`).
- Enforcement automation implemented: `.github/workflows/api-route-ownership-governance.yml` now blocks gateway route config changes when ownership map updates or route-to-cluster alignment checks are missing.

Key work:
- Publish canonical API route ownership map by bounded context.
- Add contract-review checklist to PR and release readiness processes.
- Require contract map update when ownership changes.

Exit criteria:
- Route ownership map exists and is linked from DevOps and Architecture guides.
- PR template/checklist includes contract-impact acknowledgement.

## Phase 5 - Operational Hardening (Week 3 to Week 4)

Goal: improve incident response speed and rollback confidence.

Status:
- Initial controls implemented: operational hardening runbook (`docs/stakeholders/operational-hardening-runbook.md`), rollback drill log (`docs/stakeholders/rollback-drill-log.md`), and post-rollback route probe gate in `.github/workflows/rollback.yml`.
- Readiness automation implemented: rollback cadence/MTTR monitoring in `.github/workflows/weekly-platform-scorecard.yml` and thresholded readiness checks in `.github/workflows/rollback-drill-readiness.yml`.

Key work:
- Standardize rollback drills for top-risk services.
- Add runbook steps for OIDC failures, registry auth failures, and gateway route regressions.
- Validate smoke and health probes as post-rollback acceptance gates.

Exit criteria:
- At least one documented rollback drill completed successfully.
- Mean time to restore release gate is below 4 hours over rolling incidents.

## Phase 6 - Environment Promotion Pipeline (Week 4 to Week 5)

Goal: enforce a structured dev → staging → production promotion pipeline with automated gate checks at each tier.

Status:
- Automation implemented via `.github/workflows/environment-promotion.yml` with three sequential gate jobs.

Key work:
- Configure `production-promotion` GitHub Environment in repo settings with required reviewers.
- Ensure dev gate (cloud-e2e, workflow-lint, pr-validation, helm-chart-validation, gateway-route-probes) is passing on `main` before any staging promotion is attempted.
- Require staging gate (runtime-convergence-audit, compliance-check, cloud-e2e-regression, rollback-drill-readiness) before production approval is surfaced.
- Document promotion SOP in operational hardening runbook.

Exit criteria:
- At least one full dev → staging → production gate sequence completed with all checks passing.
- Production promotion requires and records a manual approval from a CODEOWNERS member.

## Phase 7 - SLO / Error Budget Enforcement (Week 5 to Week 6)

Goal: track availability SLI from CI evidence and alert when error budget burn rate threatens the 99.5% SLO target.

Status:
- Automation implemented via `.github/workflows/slo-error-budget.yml` with 28-day rolling window SLI computation.

Key work:
- Validate SLI data quality once Cloud E2E and Gateway Route Probe pass rates stabilize (Phase 1 prerequisite).
- Wire SLO breach alert into incident response runbook.
- Add error budget remaining to platform manager stakeholder dashboard.
- Tune SLO target and alert threshold based on first two weeks of data.

Exit criteria:
- SLO error budget report generated for at least 2 consecutive weeks.
- Error budget < 20% triggers a failed workflow signal captured in weekly scorecard.
- Platform review meeting uses SLO data as a primary reliability signal.

## Phase 8 - Security Posture Scorecard (Week 6 to Week 7)

Goal: continuously audit supply-chain hygiene and source code security posture through OpenSSF Scorecard and CodeQL SAST.

Status:
- Automation implemented via `.github/workflows/security-scorecard.yml` with OpenSSF Scorecard and CodeQL matrix for C# and JavaScript/TypeScript.

Key work:
- Enable GitHub Advanced Security (GHAS) on the repository so CodeQL results surface in the Security tab.
- Review initial OpenSSF Scorecard results and address low-scoring checks (branch protection, dependency pinning, token permissions).
- Triage CodeQL findings and close or suppress with justification.
- Add `security-scorecard.yml` as a required check for production-bound merges in `release-gate-policy.json`.

Exit criteria:
- OpenSSF Scorecard score >= 7.0 / 10.
- No unacknowledged Critical or High CodeQL findings open for > 14 days.
- Security posture pass trend visible in weekly platform scorecard.

## Ownership Model

- DevOps: deployment identity, workflow gates, AKS/infra execution, promotion pipeline.
- Backend + QA: route contract correctness, probe alignment, CodeQL triage.
- Platform manager: scorecard cadence, release evidence governance, SLO review.
- Solutions architect: ownership boundaries, contract governance controls, OpenSSF Scorecard remediation.
- Security: CodeQL finding triage, GHAS configuration, supply-chain policy.

## Phase 9 - Chaos Readiness Audit (Week 7 to Week 8)

Goal: verify that all microservices are configured for resilience before failures occur in production.

Status:
- Automation implemented via `.github/workflows/chaos-readiness.yml` auditing Helm values for readiness/liveness probes, resource requests/limits, and replica redundancy across all 10 services.

Key work:
- Ensure all Helm Deployment templates define `readinessProbe` and `livenessProbe`.
- Verify all services have `replicas >= 2` in production values for fault tolerance.
- Add YARP retry and circuit-breaker policies to the gateway route configuration.
- Document chaos readiness baseline in operational hardening runbook.

Exit criteria:
- Chaos readiness audit passes with zero gaps on main.
- Gateway config has retry + timeout policies for all upstream clusters.
- At least 2 replicas configured for all production services.

## Phase 10 - Cost Governance (Week 8 to Week 9)

Goal: enforce resource budget thresholds for all services and prevent unbounded horizontal scaling from surprise cost events.

Status:
- Automation implemented via `.github/workflows/cost-governance.yml` auditing CPU/memory requests and limits against approved per-service budget thresholds.

Key work:
- Review current production values against the budget thresholds (CPU ≤ 4 cores, Memory ≤ 8 GiB per container).
- Define and document the approval process for budget exceptions.
- Add `maxReplicas` bounds to Helm values for all services that support KEDA/HPA scaling.
- Wire cost governance pass/fail into the environment promotion staging gate.

Exit criteria:
- Cost governance audit passes for two consecutive weeks on main.
- All production services have explicit `resources.requests` and `resources.limits` defined.
- Budget exception register documented for any services requiring higher limits.

## Phase 11 - Dependency Freshness (Week 9 to Week 10)

Goal: eliminate supply-chain risk from mutable action pins and ensure CI automation runs on supported Node runtimes.

Status:
- Automation implemented via `.github/workflows/dependency-freshness.yml` scanning all workflow files for floating pins, stale major versions, and deprecated Node runtime references.

Key work:
- Resolve all floating mutable-branch action pins (use SHA pins or latest major version tags).
- Upgrade any actions pinned to stale major versions (reference the KNOWN_LATEST manifest in the workflow).
- Replace deprecated `node-version: 20` references before GitHub's Q3 2026 enforcement date.
- Add dependency-freshness to the environment promotion dev gate.

Exit criteria:
- Dependency freshness audit passes with zero high-risk floating pins.
- No Node 20 references remain in any workflow file.
- All GitHub-owned actions are on their latest known major version.

## Phase 12 - API Contract Drift Detection (Week 10 to Week 11)

Goal: prevent breaking API changes from reaching production consumers without a formal major-version bump and consumer notification.

Status:
- Automation implemented via `.github/workflows/api-contract-drift.yml` comparing OpenAPI/Swagger spec files between PR base and head, failing on removed operations.

Key work:
- Generate OpenAPI spec files for all 10 services from Swagger endpoints and commit to `docs/api/`.
- Integrate spec export into the `microservice-deploy.yml` post-build step.
- Define the consumer notification SOP for breaking API changes.
- Add API contract drift as a required check for production-bound merges in `release-gate-policy.json`.

Exit criteria:
- All 10 service spec files present in `docs/api/` on main.
- PR with removed API operations is blocked by contract drift check.
- Consumer notification process is documented for breaking changes.

## Phase 13 - Credential Hygiene Audit (Week 11 to Week 12)

Goal: prevent hardcoded credentials and PHI-adjacent secrets from entering source control (HIPAA § 164.312(a)(2)(iv) compliance).

Status:
- Automation implemented via `.github/workflows/credential-hygiene.yml` scanning all source files with 12+ high-confidence and 3 medium-confidence credential patterns as a PR gate and weekly scan.

Key work:
- Remediate any existing HIGH findings surfaced by the initial scan run.
- Enable GitHub Secret Scanning and push protection on the repository.
- Document the approved secret storage standard: Azure Key Vault for runtime secrets, GitHub Secrets for CI secrets.
- Add credential hygiene as a required PR check.

Exit criteria:
- Credential hygiene audit passes with zero HIGH findings on main.
- GitHub Secret Scanning and push protection enabled.
- Secret storage standard documented and linked from the security runbook.

## Phase 14 - Service Health Endpoint Governance (Week 12 to Week 13)

Goal: ensure all 10 microservices expose standardized health endpoints and that Kubernetes probes are configured to use them, preventing silent pod failures from routing live traffic.

Status:
- Automation implemented via `.github/workflows/service-health-governance.yml` auditing Helm Deployment templates for liveness/readiness probes and verifying health check registration in each service's Program.cs.

Key work:
- Add `livenessProbe` and `readinessProbe` to all Deployment/StatefulSet Helm templates using `httpGet` on `/healthz`.
- Ensure all 10 services call `services.AddHealthChecks()` and `app.MapHealthChecks("/healthz")` in `Program.cs`.
- Configure YARP `ActiveHealthCheck` in gateway `appsettings.json` for all upstream clusters.
- Add `startupProbe` for slow-starting services (`fhir`, `ai-agent`) with an appropriate `initialDelaySeconds`.

Exit criteria:
- Service health governance audit passes for two consecutive weeks.
- All 10 services have liveness and readiness probes in Helm templates.
- YARP gateway uses active health checks for all upstream clusters.

## Ownership Model

- DevOps: deployment identity, workflow gates, AKS/infra execution, promotion pipeline, dependency freshness remediation.
- Backend + QA: route contract correctness, probe alignment, CodeQL triage, chaos readiness probe coverage, health endpoint implementation, API spec generation.
- Platform manager: scorecard cadence, release evidence governance, SLO review, cost budget approvals.
- Solutions architect: ownership boundaries, contract governance controls, OpenSSF Scorecard remediation, cost exception register, API contract versioning policy.
- Security: CodeQL finding triage, GHAS configuration, supply-chain policy, credential hygiene remediation, secret storage standards.

## Phase 15 - Frontend Deploy Evidence Enforcement (Week 13 to Week 14)

Goal: close the P1 release-gate gap where a failed or missing frontend deployment does not block the Cloud E2E gate, allowing stale or broken MFE builds to be tested as if they were successfully deployed.

Status:
- Enforcement implemented in `.github/workflows/cloud-e2e-tests.yml` deployment-sync gate.

Key work:
- Make `Frontend MFE CI/CD` a required evidence source in the Cloud E2E deployment-sync gate when the triggering workflow is `Frontend MFE CI/CD` (dynamic `optionalIfMissing` based on trigger identity).
- Add `build-and-deploy` job-level inspection for frontend deploy evidence, mirroring the `post-deploy-smoke` job check used for backend deploys.
- Distinguish three frontend deploy outcomes: `ready` (build-and-deploy succeeded), `not-deployed` (build-and-deploy skipped — no MFE changes in push), and `failed` (build-and-deploy failed — gate must block).
- When no MFE changes triggered a deploy (`build-and-deploy` skipped), treat as `not-deployed` (terminal no-deploy) so Cloud E2E downstream jobs are intentionally skipped rather than erroneously passing against stale SWA builds.

Exit criteria:
- Cloud E2E `deployment-sync` blocks with `hardFailure` when `Frontend MFE CI/CD` triggered the run but `build-and-deploy` failed.
- Cloud E2E `deployment-sync` emits `not-deployed` (intentional skip) when `Frontend MFE CI/CD` ran but no MFE apps changed.
- Cloud E2E `deployment-sync` treats frontend as optional evidence only when triggered by `Microservice CI/CD` or via schedule/manual dispatch.

## Phase 16 - Security Scorecard Gate Promotion (Week 14 to Week 15)

Goal: complete Phase 8's open exit criterion by making security posture a first-class blocker on the production promotion gate and an audited post-merge check, so no release can reach production while the OpenSSF Scorecard or CodeQL pipeline is failing.

Status:
- Enforcement implemented in `.github/release-gate-policy.json` and `.github/workflows/environment-promotion.yml` production gate.

Key work:
- Add `security-scorecard.yml` to `recommendedPostMergeChecks` in `release-gate-policy.json` so the Release Gate Policy Audit tracks it within the `postMergeSuccessWindowDays` window.
- Wire `security-scorecard.yml` into the environment-promotion production gate alongside `release-gate-policy-audit`, `dora-metrics`, and `weekly-platform-scorecard`; production promotion is now blocked when security posture has not passed recently on main.
- Mark the P1 Node 20 deprecation gap resolved in `platform-gap-backlog-2026-04-25.md`: no `node-version: 20` references exist in any workflow; `dependency-freshness.yml` enforces the pattern in the dev gate on every PR touching workflows.

Exit criteria:
- `release-gate-policy.json` lists `security-scorecard.yml` under `recommendedPostMergeChecks`.
- Environment-promotion production gate evaluates `security-scorecard` pass/fail alongside the three existing production governance checks.
- Release Gate Policy Audit surfaces security scorecard status within the 14-day success window.
- P1 Node 20 deprecation backlog item closed with evidence of zero references and gate enforcement.
