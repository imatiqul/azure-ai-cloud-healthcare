# SRE and Operations Guide

This guide is for engineers responsible for runtime health, incident triage, and deployment stability.

## SRE and Operations Scope

- Service and frontend availability verification.
- Post-deploy smoke validation and ongoing health monitoring.
- Safe rollout, rollback, and incident response coordination.

## Runtime and Operations Assets

| Area | Path | Operational Value |
|---|---|---|
| Post-deploy cloud tests | [.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml) | Immediate confidence on live behavior |
| Deployment health dashboard | [.github/workflows/deployment-health.yml](../../.github/workflows/deployment-health.yml) | Daily and post-deploy service/SWA health summary |
| Service deploy workflow | [.github/workflows/microservice-deploy.yml](../../.github/workflows/microservice-deploy.yml) | Image rollout and container app updates |
| Frontend deploy workflow | [.github/workflows/frontend-deploy.yml](../../.github/workflows/frontend-deploy.yml) | MFE rollout to Static Web Apps |
| Rollback workflow | [.github/workflows/rollback.yml](../../.github/workflows/rollback.yml) | Recovery path for bad releases |
| Operational hardening runbook | [operational-hardening-runbook.md](operational-hardening-runbook.md) | Incident playbooks and rollback drill execution standard |
| Rollback drill log | [rollback-drill-log.md](rollback-drill-log.md) | Drill evidence and MTTR tracking |
| GitOps resources | [infra/argocd](../../infra/argocd), [infra/helm](../../infra/helm) | Desired-state and rollout policy artifacts |

## Daily Operations Routine

1. Review latest run of [deployment-health.yml](../../.github/workflows/deployment-health.yml).
2. Check whether cloud smoke/full E2E passed after the latest deploy workflows.
3. Track repeated failures for a specific service, MFE, or route.
4. Confirm no pending rollback actions from unresolved incidents.
5. Review new entries and open follow-ups in [rollback-drill-log.md](rollback-drill-log.md).

## Release Window Readiness

Before a production release:

1. Confirm health dashboard is stable for all tracked services and SWAs.
2. Confirm cloud smoke gate is green for the candidate commit.
3. Confirm rollback workflow can be executed by on-call responders.
4. Confirm deployment owners and incident commander are assigned.
5. Confirm latest rollback drill evidence includes route smoke probe results.

## Incident Triage Entry Points

- Service availability and revision state: check deployment health summary.
- Endpoint failures: run smoke probes and cloud E2E slices.
- Frontend outage: verify corresponding SWA endpoint status and latest frontend deploy job.
- Rollback criteria: use [rollback.yml](../../.github/workflows/rollback.yml) when user-facing impact is confirmed.

## Operations Checklist

- Every deploy has post-deploy validation evidence.
- Alert-worthy regressions are linked to run IDs and owning team.
- Rollback decisions are documented with clear trigger criteria.
- Recovery outcomes are captured in release notes or incident timeline.
- Post-rollback route probe gate passes for critical API prefixes.
