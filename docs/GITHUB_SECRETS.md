# GitHub Repository Secrets — HealthQ Copilot

All secrets below must be added at **Settings → Secrets and variables → Actions** in the GitHub repository.

---

## Azure OIDC Federation (required by all deploy workflows)

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | App Registration (service principal) client ID. Must have a **Federated Credential** for `repo:<owner>/healthcare-ai:ref:refs/heads/main`. |
| `AZURE_TENANT_ID` | Entra ID (AAD) tenant ID. |
| `AZURE_SUBSCRIPTION_ID` | Target Azure subscription ID. |

**How to configure OIDC federation:**
```bash
# Create an App Registration
az ad app create --display-name "healthq-copilot-github-ci"
APP_ID=$(az ad app list --display-name "healthq-copilot-github-ci" --query "[0].appId" -o tsv)

# Create service principal
az ad sp create --id "$APP_ID"

# Assign Contributor role on the subscription
az role assignment create \
  --role Contributor \
  --assignee "$APP_ID" \
  --scope "/subscriptions/<SUBSCRIPTION_ID>"

# Add Federated Credential for GitHub Actions main branch
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<OWNER>/healthcare-ai:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

---

## GHCR Pull Token (required by microservice-deploy.yml → ACA)

| Secret | Description |
|--------|-------------|
| `GHCR_PULL_TOKEN` | GitHub **Personal Access Token** with `read:packages` scope. Used by Azure Container Apps to pull images from `ghcr.io`. Must be long-lived (Classic PAT). |

**Alternatively**, make the GHCR packages public so ACA can pull without credentials:
`GitHub → Packages → <package> → Package settings → Change visibility → Public`

---

## Static Web App Deploy Tokens (required by frontend-deploy.yml)

Run `infra/aca/bootstrap.sh` to provision SWAs — it prints the exact token values.
Then create these secrets in GitHub with the printed values:

| Secret | App |
|--------|-----|
| `SHELL_DEPLOY_TOKEN` | `healthq-copilot-shell` SWA deploy key |
| `VOICE_MFE_DEPLOY_TOKEN` | `healthq-copilot-voice-mfe` SWA deploy key |
| `TRIAGE_MFE_DEPLOY_TOKEN` | `healthq-copilot-triage-mfe` SWA deploy key |
| `SCHEDULING_MFE_DEPLOY_TOKEN` | `healthq-copilot-scheduling-mfe` SWA deploy key |
| `POPHEALTH_MFE_DEPLOY_TOKEN` | `healthq-copilot-pophealth-mfe` SWA deploy key |
| `REVENUE_MFE_DEPLOY_TOKEN` | `healthq-copilot-revenue-mfe` SWA deploy key |
| `ENCOUNTERS_MFE_DEPLOY_TOKEN` | `healthq-copilot-encounters-mfe` SWA deploy key |
| `ENGAGEMENT_MFE_DEPLOY_TOKEN` | `healthq-copilot-engagement-mfe` SWA deploy key |

---

## SWA Public URLs (optional overrides)

These are used by `cloud-e2e-tests.yml` and `frontend-deploy.yml` as fallbacks.
Only set these if the SWA URLs differ from the defaults hardcoded in the workflows.

| Secret | Description |
|--------|-------------|
| `ENCOUNTERS_MFE_URL` | Full `remoteEntry.js` URL for encounters-mfe SWA (e.g. `https://<name>.azurestaticapps.net/remoteEntry.js`) |
| `ENGAGEMENT_MFE_URL` | Full `remoteEntry.js` URL for engagement-mfe SWA |
| `ENCOUNTERS_SWA_URL` | Base URL for encounters-mfe SWA (no `/remoteEntry.js`) |
| `ENGAGEMENT_SWA_URL` | Base URL for engagement-mfe SWA |

---

## Infrastructure Deploy

| Secret | Description |
|--------|-------------|
| `GRAFANA_ADMIN_PASSWORD` | Initial Grafana admin password for the kube-prometheus-stack Helm release. |

---

## Chromatic Visual Regression (required by chromatic.yml)

| Secret | Description |
|--------|-------------|
| `CHROMATIC_PROJECT_TOKEN` | Project token from [https://www.chromatic.com](https://www.chromatic.com). Create a project and copy the token from Project → Manage → Configure. |

---

## Lighthouse CI (required by lighthouse-ci.yml)

| Secret | Description |
|--------|-------------|
| `LHCI_GITHUB_APP_TOKEN` | GitHub App token for Lighthouse CI status checks. Install the [Lighthouse CI GitHub App](https://github.com/apps/lighthouse-ci). |
| `LHCI_TOKEN` | Lighthouse CI server token (if using a self-hosted LHCI server). |

---

## Cloud Deployment Quick-Reference

After adding all secrets, trigger the workflows in this order:

```text
1. infra-deploy.yml         (workflow_dispatch) — provisions all Azure resources
2. microservice-deploy.yml  (workflow_dispatch) — builds+pushes Docker images, deploys to ACA
3. frontend-deploy.yml      (workflow_dispatch) — builds+deploys all 8 MFE SWAs
4. deployment-health.yml    (workflow_dispatch) — verifies all services are healthy
```

### Verify cloud state (run locally with `az login`):
```bash
# ACA services
az containerapp list \
  --resource-group healthq-copilot-rg \
  --query "[].{name:name,status:properties.runningStatus,image:properties.template.containers[0].image}" \
  -o table

# Static Web Apps
az staticwebapp list \
  --resource-group healthq-copilot-rg \
  --query "[].{name:name,url:properties.defaultHostname,status:properties.provisioningState}" \
  -o table

# APIM
az apim show \
  --name healthq-copilot-apim \
  --resource-group healthq-copilot-rg \
  --query "{name:name,state:properties.provisioningState,sku:sku.name,url:properties.gatewayUrl}" \
  -o table
```
