# Platform Manager Guide

This guide is for leaders coordinating roadmap, delivery quality, and cross-team execution.

## What the Platform Delivers

- Multi-service healthcare backend with domain-specific bounded contexts.
- Independent micro frontend delivery per business domain.
- AI-assisted triage with human-in-the-loop escalation.
- Infrastructure automation, compliance artifacts, and post-deploy quality gates.

## Team and Responsibility Views

| Team | Primary Surfaces |
|---|---|
| Backend | [src](../../src), [tests/HealthQCopilot.Tests.Unit](../../tests/HealthQCopilot.Tests.Unit), [tests/HealthQCopilot.Tests.Integration](../../tests/HealthQCopilot.Tests.Integration) |
| Frontend | [frontend/apps](../../frontend/apps), [frontend/packages](../../frontend/packages) |
| AI | [src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents), [frontend/apps/triage-mfe](../../frontend/apps/triage-mfe) |
| DevOps/Platform | [infra](../../infra), [.github/workflows](../../.github/workflows) |

## Release Flow (At a Glance)

1. Pull request enters quality gates in [pr-validation.yml](../../.github/workflows/pr-validation.yml).
2. Service and frontend deploy workflows publish and deploy changed components.
3. Cloud smoke and full E2E checks run in [cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml).
4. If issues are found, use [rollback.yml](../../.github/workflows/rollback.yml).

## Signals to Track Weekly

| Category | Signal | Source |
|---|---|---|
| Delivery | Lead time and failed deployment rate | GitHub Actions run history |
| Quality | PR validation failures by category | [pr-validation.yml](../../.github/workflows/pr-validation.yml) |
| Runtime confidence | Post-deploy smoke/full E2E pass trend | [cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml) |
| Runtime convergence | Phase 1 exit-criteria compliance trend | [runtime-convergence-audit.yml](../../.github/workflows/runtime-convergence-audit.yml) |
| Route integrity | Gateway route non-regression trend | [gateway-route-probes.yml](../../.github/workflows/gateway-route-probes.yml) |
| Release gate compliance | Required-check policy and branch-protection compliance trend | [release-gate-policy-audit.yml](../../.github/workflows/release-gate-policy-audit.yml) |
| Security/compliance | Secret scanning and vulnerability findings | [compliance-check.yml](../../.github/workflows/compliance-check.yml) |
| Leadership scorecard | Weekly pass-rate and KPI snapshot | [weekly-platform-scorecard.yml](../../.github/workflows/weekly-platform-scorecard.yml) |
| Operational resilience | Rollback drill cadence and MTTR readiness trend | [rollback-drill-readiness.yml](../../.github/workflows/rollback-drill-readiness.yml), [rollback-drill-log.md](rollback-drill-log.md) |

## Compliance and Governance References

- [SOC2/HITRUST Control Mapping](../compliance/SOC2-HITRUST-Control-Mapping.md)
- [ISO 27001 Control Mapping](../compliance/ISO27001-Control-Mapping.md)
- [FedRAMP Authorization Boundary](../compliance/FedRAMP-Authorization-Boundary.md)
- [NHS DSP Toolkit Self-Assessment](../compliance/NHS-DSP-Toolkit-Self-Assessment.md)
- [Workflow Catalog](../../.github/workflows)

## Platform Review Checklist

- Cross-team dependencies are explicit and scheduled.
- Each release candidate has backend + frontend + cloud E2E evidence.
- Security/compliance checks are green or have approved risk acceptance.
- Rollback path is confirmed for production window.
- Rollback readiness workflow is green or has an approved mitigation plan.

## Planning Reference

- [Platform Gap Backlog — April 25, 2026](platform-gap-backlog-2026-04-25.md)
- [Platform Next Phases — April 26, 2026](platform-next-phases-2026-04-26.md)
- [Operational Hardening Runbook](operational-hardening-runbook.md)
