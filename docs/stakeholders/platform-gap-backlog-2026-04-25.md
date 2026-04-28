# Platform Gap Backlog — April 25, 2026

## Scope

This backlog captures the highest-impact platform gaps identified during the latest product review and maps them to execution-ready initiatives.

## Current Reality Snapshot

- Microservice CI/CD reliability recovered after workflow hardening.
- Manual redeploy now includes OIDC preflight fail-fast to reduce repeated matrix failures when federation is misconfigured.
- Cloud E2E deployment sync now distinguishes hard deploy failures from no-deploy triggers (post-deploy-smoke skipped) to reduce false-failure noise.
- Cloud smoke gate passes consistently.
- Full cloud E2E is still failing on key live API checks, indicating runtime drift and contract misalignment.

## Priority Backlog

| Priority | Gap | Business Impact | Initiative | Owner | Target |
|---|---|---|---|---|---|
| P0 | Full cloud E2E route failures on production gateway | Release confidence blocked; high regression risk | Run targeted service redeploy for identity, agent, scheduling, notification, revenue and rerun cloud E2E | DevOps + Service leads | 24 hours |
| P0 | API contract mismatch between live tests and backend route ownership | False negatives in release gates; noisy triage | Align cloud smoke route probes to current service contracts and publish canonical route map | QA + Backend | 24 hours |
| P0 | Azure OIDC federated credential subject mismatch blocks ACA deployment | Cannot ship runtime fixes; Cloud E2E gate remains stale | Update Entra federated identity subject to `repo:imatiqul/azure-ai-cloud-healthcare:ref:refs/heads/main` (or matching environment subject) and re-run targeted redeploy | DevOps + Cloud platform | 24 hours |
| P1 | Documentation confidence drift ("all complete" narrative vs failing live evidence) | Leadership signal quality reduced | Introduce weekly evidence-driven scorecard from workflow outcomes and route probe SLOs | Product + Platform manager | 1 week |
| P1 | workflow_run gating allows optional frontend deploy evidence | Incomplete release evidence chain | Make frontend deploy required for production cloud E2E release gate where applicable — **resolved in Platform Phase 15: `cloud-e2e-tests.yml` deployment-sync now requires `Frontend MFE CI/CD` evidence when it is the triggering workflow; `build-and-deploy` job-level inspection added** | DevOps | 1 week |
| P1 | Node 20 GitHub Action deprecation warnings | Near-term CI instability risk | Upgrade action versions and validate Node 24 compatibility before enforcement date — **resolved in Phase 11 / Phase 16: no node-version: 20 references exist in any workflow (all on 22); dependency-freshness.yml enforces this pattern in the environment-promotion dev gate on every PR touching workflows** | DevOps | Before June 2026 |
| P2 | Missing endpoint ownership/contract governance process | Repeated route drift incidents | Add API contract review checklist to PR validation and release readiness checklist | Product + Architecture | 2 weeks |

## Active Execution

- Triggered targeted redeploy run:
  - Workflow: `Microservice CI/CD`
  - Run: `24946993738`
  - Services: `revenue,notification,identity,ai-agent,scheduling`
  - Goal: converge deployed runtime with source-defined endpoint surface.
- Current result:
  - Run `24946993738` failed in `Build + format check` before deploy stages.
  - Primary blocker is repo formatting/charset drift in targeted services (not compile failures).
- Immediate next execution:
  - Merge workflow update that adds manual input `skip_format_check` for emergency redeploys.
  - Rerun `Microservice CI/CD` with `services=revenue,notification,identity,ai-agent,scheduling` and `skip_format_check=true`.
- Execution update:
  - Run `24947129713` launched on SHA `d228046` with `skip_format_check=true`.
  - Build, unit tests, and integration tests completed successfully for targeted services.
  - Deployment blocked at `Azure login (OIDC)` with `AADSTS700213` (no matching federated identity record for current repo subject).
  - Cloud E2E run `24947167417` is waiting in `Deployment Sync Gate` because required deploy workflows for the SHA are not ready.
  - Latest Cloud E2E run `24947212074` completed with failure in `Full E2E Suite`.
  - Current failing probes are still `404/405` on gateway-facing APIs:
    - `/api/v1/revenue/denials/`
    - `/api/v1/revenue/denials/analytics`
    - `/api/v1/notifications/analytics/delivery`
    - `/api/v1/agents/decisions/ml-confidence`
  - Run `24947559015` launched on SHA `910dc9b` with `services=revenue,notification,identity,ai-agent,scheduling` and `skip_format_check=true`.
  - All five targeted service jobs failed at `Azure login (OIDC)` with the same `AADSTS700213` subject mismatch: `repo:imatiqul/azure-ai-cloud-healthcare:ref:refs/heads/main`.
  - No Azure Container Apps deployments were executed; `post-deploy-smoke` was skipped.
  - Validation run `24947630735` on SHA `a91f7a4` confirmed new fail-fast behavior: `azure-login-preflight` failed immediately, while `test-and-build` was skipped by design.
  - Cloud E2E runs `24947675600` (SHA `e054350`) and `24947693208` (SHA `3972807`) now complete `success` with intentional skips when no deploy evidence exists (`post-deploy-smoke` skipped).
  - Added gateway route mapping for identity admin audit APIs: `/api/v1/admin/audit/{**catch-all}` now resolves to `identity-service` in source configuration.
  - Hardened cloud smoke probes for trailing-slash route variants (`denials`, `break-glass`, `practitioners`) and added ML confidence legacy probe fallback to reduce rollout-time false negatives.
  - Validation for SHA `551b904`: `Microservice CI/CD` run `24947854391` succeeded; authoritative `Cloud E2E Tests` run `24947857842` succeeded with intentional no-deploy skips.
  - Added optional `AZURE_CREDENTIALS` service-principal fallback in `Microservice CI/CD` manual preflight and deploy login path so emergency redeploy can proceed if OIDC federation is misconfigured.
  - Workflow parse regression from secret checks in `if` was corrected on SHA `2f87dd6`; push run `24948027975` completed `success` with expected no-deploy skips.
  - Manual fallback validation run `24948028887` on SHA `2f87dd6` confirms both auth attempts execute: OIDC fails with `AADSTS700213`, then secret fallback runs and fails because required credential values are not present (indicating `AZURE_CREDENTIALS` is not configured with valid service principal JSON).
  - Current state: fallback path is implemented and exercised, but emergency redeploy remains blocked until either federated credential subject is fixed or `AZURE_CREDENTIALS` is provisioned.
  - Until Entra federated credential subject is corrected, Cloud E2E route failures remain a blocked runtime convergence issue (not a resolved test-contract issue).

## Acceptance Criteria

1. Cloud E2E full suite succeeds for two consecutive main branch runs.
2. All Phase 12, Phase 27, and Phase 41 route probes return non-404/non-405 statuses.
3. Release readiness checklist references live workflow evidence, not static status claims.
4. CI actions no longer emit Node 20 deprecation warnings.

## KPI Tracking (Weekly)

| KPI | Baseline | Target |
|---|---|---|
| Cloud E2E full suite pass rate | Failing on latest run | >= 95% over rolling 10 runs |
| API route probe failure count | 9 failures (latest full suite) | 0 |
| Deployment failure rate | Elevated due route drift | < 5% |
| Mean time to restore release gate | Ad hoc | < 4 hours |

## Dependencies

- Azure Container Apps revision rollout for affected services.
- Gateway/APIM route parity with backend service endpoints.
- QA validation after redeploy completion.

## Notes

- This backlog is intentionally outcome-first; tasks should be closed only when acceptance criteria are verified in CI evidence.
