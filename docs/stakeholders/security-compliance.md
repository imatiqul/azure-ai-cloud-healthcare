# Security and Compliance Guide

This guide is for security engineers, compliance leads, and release approvers.

## Security and Compliance Scope

- Shift-left security checks in pull requests and scheduled scans.
- Evidence collection for SOC2/HITRUST, ISO 27001, FedRAMP, and NHS DSP references.
- Secret hygiene and vulnerability management gates.

## Key Security and Compliance Assets

| Area | Path | Purpose |
|---|---|---|
| PR gate security checks | [.github/workflows/pr-validation.yml](../../.github/workflows/pr-validation.yml) | Early vulnerability and code quality blocking |
| Credential hygiene gate | [.github/workflows/credential-hygiene.yml](../../.github/workflows/credential-hygiene.yml) | Blocks PRs with hardcoded secrets (HIGH patterns); weekly scheduled scan |
| Scheduled compliance checks | [.github/workflows/compliance-check.yml](../../.github/workflows/compliance-check.yml) | Gitleaks, Trivy, ZAP, k6, Lighthouse compliance posture |
| Secret storage standard | [docs/security/secret-storage-standard.md](../security/secret-storage-standard.md) | Approved tiers (Key Vault / GitHub Secrets), rotation policy, bypass register |
| Secret references | [.github/workflows](../../.github/workflows) | Workflow-level secret usage and required keys |
| Compliance mappings | [docs/compliance](../compliance) | Control mappings and assessment documentation |
| Infrastructure baseline | [infra/bicep](../../infra/bicep) | Security-relevant infrastructure configuration |

## Operational Security Workflow

### 1) Pull request phase

Require passing status from:

- [pr-validation.yml](../../.github/workflows/pr-validation.yml)
- [credential-hygiene.yml](../../.github/workflows/credential-hygiene.yml) — required PR check; blocks HIGH-confidence hardcoded secret patterns

### 2) Scheduled or pre-release phase

Run and review:

- [compliance-check.yml](../../.github/workflows/compliance-check.yml)

### 3) Deployment health evidence

Review runtime signals from:

- [deployment-health.yml](../../.github/workflows/deployment-health.yml)

## What to Verify Before Release Approval

1. No active secret leaks in current branch scan output — credential hygiene gate passes with zero HIGH findings.
2. No unresolved critical vulnerability findings blocking release policy.
3. Relevant compliance mapping docs reflect current architecture state.
4. Required production secrets are present and rotated per policy (see [secret-storage-standard.md](../security/secret-storage-standard.md)).
5. Incident response and rollback owners are assigned for release window.
6. GitHub Secret Scanning and Push Protection are confirmed enabled (Settings → Security → Code security and analysis).

## Compliance References

- [SOC2 and HITRUST Mapping](../compliance/SOC2-HITRUST-Control-Mapping.md)
- [ISO 27001 Mapping](../compliance/ISO27001-Control-Mapping.md)
- [FedRAMP Boundary](../compliance/FedRAMP-Authorization-Boundary.md)
- [NHS DSP Self-Assessment](../compliance/NHS-DSP-Toolkit-Self-Assessment.md)
- [Secret Storage Standard](../security/secret-storage-standard.md)

## Security and Compliance Checklist

- Credential hygiene audit passes with zero HIGH findings on main.
- GitHub Secret Scanning and Push Protection are enabled on the repository.
- Security scans are passing or formally risk-accepted.
- Secrets are not stored in code and are managed via Azure Key Vault or GitHub Secrets (see [secret-storage-standard.md](../security/secret-storage-standard.md)).
- Compliance artifacts are updated when architecture or process changes.
- Post-deploy health evidence is archived with release records.
