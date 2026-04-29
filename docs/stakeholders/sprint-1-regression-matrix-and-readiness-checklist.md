# Sprint 1 Regression Matrix and Production Readiness Checklist

Date: 2026-04-28
Owner: Platform Delivery
Scope: Sprint 1 closeout evidence before sprint rollover

## Objective

Capture one authoritative evidence bundle for Sprint 1 release confidence.
A Sprint 1 closeout is considered complete only when every required check below has a passing run URL and timestamp.

## Required Evidence Links

| Area | Workflow / Source | Latest run URL | Result | Notes |
|---|---|---|---|---|
| Cloud smoke | .github/workflows/cloud-e2e-tests.yml | | | |
| Cloud regression | .github/workflows/cloud-e2e-regression.yml | | | |
| Gateway route probes | .github/workflows/gateway-route-probes.yml | | | |
| Runtime convergence | .github/workflows/runtime-convergence-audit.yml | | | |
| Compliance and security | .github/workflows/compliance-check.yml | | | |
| Release policy audit (strict) | .github/workflows/release-gate-policy-audit.yml | | | |
| Release readiness orchestrator | .github/workflows/release-readiness-orchestrator.yml | | | |

## Regression Matrix

| Domain | Scenario | Expected result | Evidence run URL | Status |
|---|---|---|---|---|
| API routes | Revenue denials endpoints return non-404/non-405 | Pass | | |
| API routes | Notification analytics delivery endpoint returns non-404/non-405 | Pass | | |
| API routes | Agent ML confidence endpoint returns non-404/non-405 | Pass | | |
| Frontend cloud journeys | Shell to MFE navigation smoke passes | Pass | | |
| Frontend cloud journeys | Workflow handoff regression spec passes | Pass | | |
| Promotion policy | Required branch checks match release-gate-policy.json | Pass | | |

## Sprint 1 Readiness Checklist

- [ ] Two consecutive successful main-branch runs for cloud smoke and cloud regression are recorded.
- [ ] No critical route probe shows HTTP 404 or 405 in the latest accepted run window.
- [ ] Runtime convergence audit is green on main.
- [ ] Compliance and security checks are green on main.
- [ ] Release gate policy audit passes in strict mode.
- [ ] Release readiness orchestrator reports ready for production target.
- [ ] Frontend wave 1 targets have abort-safe fetch lifecycle handling and passing focused tests.
- [ ] Evidence links are attached for all rows in Required Evidence Links.

## Sign-off

- Technical owner:
- QA owner:
- Platform owner:
- Sign-off timestamp:
