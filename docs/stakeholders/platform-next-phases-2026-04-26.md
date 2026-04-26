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

## Ownership Model

- DevOps: deployment identity, workflow gates, AKS/infra execution.
- Backend + QA: route contract correctness and probe alignment.
- Platform manager: scorecard cadence and release evidence governance.
- Solutions architect: ownership boundaries and contract governance controls.
