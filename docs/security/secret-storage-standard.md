# Secret Storage Standard

> **HIPAA § 164.312(a)(2)(iv)** — Encryption and Decryption  
> **Phase 13 — Credential Hygiene Audit** | Last updated: 2026-04-26

This document defines the approved secret storage tiers for HealthQ Copilot, the GitHub Secret Scanning / Push Protection enablement procedure, and the rotation and remediation processes.

---

## 1 · Approved Secret Storage Tiers

| Secret Category | Approved Store | Forbidden Alternatives |
|---|---|---|
| Runtime service secrets (DB passwords, API keys, Event Hub connection strings, ACS connection strings, Cosmos account keys) | **Azure Key Vault** (referenced via Container Apps secret store or DAPR secret store binding) | Source code, appsettings.json values, environment variables baked into container images |
| CI/CD secrets (GitHub Actions tokens, image registry credentials, OIDC federation) | **GitHub repository / environment Secrets** (Settings → Secrets and variables) | `.env` files, workflow YAML literals, runner environment bake-in |
| Local development placeholders | `appsettings.Development.json` (git-ignored) or `dotnet user-secrets` | Committed `appsettings.json` value overrides, `.env` files tracked by git |
| Certificate private keys | **Azure Key Vault Certificates** | PEM files in repository, Base64-encoded cert literals in config |
| FHIR service-to-service tokens | **Azure Managed Identity** (workload identity, no stored secret) | Hardcoded Bearer tokens, FHIR-specific API key literals |

### Key Vault Reference Pattern (Container Apps)

```yaml
# infra/helm/values.production.yaml — correct pattern
env:
  - name: ConnectionStrings__AppDb
    secretRef: appdb-connection-string      # ← Container Apps secret resolved from Key Vault

# infra/bicep/modules/container-app.bicep — secret binding
secrets:
  - name: appdb-connection-string
    keyVaultUrl: https://healthq-kv.vault.azure.net/secrets/AppDbConnectionString
    identity: <managed-identity-resource-id>
```

### GitHub Secrets Reference Pattern

```yaml
# .github/workflows/*.yml — correct CI secret reference
env:
  AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
  REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
```

---

## 2 · GitHub Secret Scanning and Push Protection

### 2.1 Enable Secret Scanning

1. Navigate to **Settings → Security → Code security and analysis**.
2. Under **Secret scanning**, click **Enable**.
3. Under **Push protection**, click **Enable**.
4. Confirm **Send alerts to** includes the Security team (Settings → Security alerts).

> **Required**: Both Secret Scanning and Push Protection must be enabled before any production-bound merge for this repository. This is a CODEOWNERS-gated repository setting.

### 2.2 Push Protection Bypass Policy

Push protection blocks commits containing detected secret patterns. If a false positive is identified:

1. Open a GitHub issue with label `secret-hygiene-fp` and paste the sanitized excerpt.
2. A CODEOWNERS member reviews and grants a single-commit bypass with a written justification.
3. The justification is recorded in this document under [§ 5 · Bypass Register](#5--bypass-register).

---

## 3 · Credential Rotation Policy

| Secret Type | Rotation Frequency | Owner | Mechanism |
|---|---|---|---|
| Azure Storage Account keys | 90 days | DevOps | Key Vault rotation policy + Container App secret refresh |
| ACS Connection Strings | 180 days | DevOps | Manual Key Vault update |
| Cosmos DB Account Keys | 90 days | DevOps | Key Vault rotation |
| Service-to-service OIDC federation tokens | Non-rotating (OIDC short-lived) | DevOps | GitHub OIDC federation — no stored credential |
| Clearinghouse API key (RevenueCycle) | 90 days or on vendor notice | Security | Key Vault update |
| GitHub Actions PATs (if any) | 60 days | DevOps | Replace with OIDC where possible |

---

## 4 · Remediation Procedure for HIGH Findings

When the [credential-hygiene.yml](../../.github/workflows/credential-hygiene.yml) workflow reports a HIGH finding:

1. **Do not merge the PR.** The workflow is a required PR check.
2. Identify the file and line number from the workflow summary.
3. Replace the hardcoded value with the appropriate Key Vault or GitHub Secret reference (see § 1).
4. If the secret was already committed to history, rotate it immediately:
   a. Revoke or regenerate the credential in the source system.
   b. Update Azure Key Vault or GitHub Secret with the new value.
   c. Open an incident ticket tagged `credential-exposure`.
5. If a git history rewrite is required, coordinate with a CODEOWNERS member via `git filter-repo` and a force-push to a protected branch (requires secondary approval).

---

## 5 · Bypass Register

| Date | PR | Rule Bypassed | Justification | Approver |
|---|---|---|---|---|
| — | — | — | No bypasses recorded | — |

---

## 6 · References

- [Credential Hygiene Audit Workflow](../../.github/workflows/credential-hygiene.yml)
- [Security and Compliance Guide](../stakeholders/security-compliance.md)
- [Operational Hardening Runbook](../stakeholders/operational-hardening-runbook.md)
- [HIPAA Agentic AI Evidence Pack](../compliance/HIPAA-Agentic-AI-Evidence-Pack.md)
- [release-gate-policy.json](../../.github/release-gate-policy.json)
