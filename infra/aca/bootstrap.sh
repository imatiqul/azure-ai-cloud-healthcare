#!/usr/bin/env bash
# ============================================================
# HealthQ Copilot — Track A (Azure Free Tier) Bootstrap Script
# One-time provisioning: Resource Group, ACA Environment,
# Container Apps (8), Static Web Apps (6), APIM, App Insights.
#
# Prerequisites:
#   - Azure CLI >= 2.60  (az login already done)
#   - Contributor role on target subscription
#
# Usage:
#   chmod +x infra/aca/bootstrap.sh
#   AZURE_SUBSCRIPTION_ID=<id> ./infra/aca/bootstrap.sh
# ============================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────
RG="healthq-copilot-rg"
LOCATION="eastus2"
ACA_ENV="healthq-copilot-env"
APIM_NAME="healthq-copilot-apim"
APIM_PUBLISHER_NAME="HealthQ Copilot"
# Set via env var or edit here:
APIM_PUBLISHER_EMAIL="${APIM_PUBLISHER_EMAIL:?Set APIM_PUBLISHER_EMAIL}"
APPINSIGHTS_NAME="healthq-copilot-insights"
LOG_ANALYTICS="healthq-copilot-logs"
REGISTRY="ghcr.io"
IMAGE_OWNER="${GITHUB_REPOSITORY_OWNER:-imatiqul}"
IMAGE_PREFIX="${REGISTRY}/${IMAGE_OWNER}/healthcare-ai/healthq-copilot"

SERVICES=(voice ai-agent fhir identity ocr scheduling notification pop-health revenue gateway)
MFE_APPS=(shell voice-mfe triage-mfe scheduling-mfe pophealth-mfe revenue-mfe encounters-mfe engagement-mfe)

# ── Subscription ──────────────────────────────────────────────
if [[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
  az account set --subscription "$AZURE_SUBSCRIPTION_ID"
fi
echo "→ Using subscription: $(az account show --query id -o tsv)"

# ── Resource Group ────────────────────────────────────────────
echo "→ Creating resource group: $RG"
az group create --name "$RG" --location "$LOCATION" --output none

# ── Log Analytics (required by ACA environment) ───────────────
echo "→ Creating Log Analytics workspace: $LOG_ANALYTICS"
az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS" \
  --location "$LOCATION" \
  --output none

LOG_WS_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS" \
  --query customerId -o tsv)
LOG_WS_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS" \
  --query primarySharedKey -o tsv)

# ── Application Insights (5 GB/month free) ────────────────────
echo "→ Creating Application Insights: $APPINSIGHTS_NAME"
az monitor app-insights component create \
  --app "$APPINSIGHTS_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --workspace "$LOG_ANALYTICS" \
  --output none

APPINSIGHTS_KEY=$(az monitor app-insights component show \
  --app "$APPINSIGHTS_NAME" \
  --resource-group "$RG" \
  --query instrumentationKey -o tsv)
APPINSIGHTS_CONN=$(az monitor app-insights component show \
  --app "$APPINSIGHTS_NAME" \
  --resource-group "$RG" \
  --query connectionString -o tsv)

# ── ACA Environment (Consumption — free) ─────────────────────
echo "→ Creating ACA environment: $ACA_ENV"
az containerapp env create \
  --name "$ACA_ENV" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --logs-workspace-id "$LOG_WS_ID" \
  --logs-workspace-key "$LOG_WS_KEY" \
  --output none

# ── Container Apps — 8 backend services ──────────────────────
# Adjust --cpu / --memory as needed (Consumption minimum = 0.25 CPU / 0.5 Gi)
declare -A SERVICE_PORTS=(
  [voice]=5001
  [ai-agent]=5002
  [fhir]=5003
  [identity]=5004
  [ocr]=5005
  [scheduling]=5006
  [notification]=5007
  [pop-health]=5008
  [revenue]=8080
  [gateway]=8080
)

# Only the gateway is publicly reachable; all other services are internal.
declare -A SERVICE_INGRESS=(
  [voice]=internal
  [ai-agent]=internal
  [fhir]=internal
  [identity]=internal
  [ocr]=internal
  [scheduling]=internal
  [notification]=internal
  [pop-health]=internal
  [revenue]=internal
  [gateway]=external
)

PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

for SERVICE in "${SERVICES[@]}"; do
  PORT="${SERVICE_PORTS[$SERVICE]:-8080}"
  INGRESS_TYPE="${SERVICE_INGRESS[$SERVICE]:-internal}"
  echo "→ Creating Container App: $SERVICE (port $PORT, ingress=$INGRESS_TYPE)"
  az containerapp create \
    --name "$SERVICE" \
    --resource-group "$RG" \
    --environment "$ACA_ENV" \
    --image "$PLACEHOLDER_IMAGE" \
    --target-port "$PORT" \
    --ingress "$INGRESS_TYPE" \
    --min-replicas 0 \
    --max-replicas 3 \
    --cpu 0.25 \
    --memory "0.5Gi" \
    --env-vars \
      "APPLICATIONINSIGHTS_CONNECTION_STRING=${APPINSIGHTS_CONN}" \
      "ASPNETCORE_ENVIRONMENT=Production" \
    --output none
done

# ── Static Web Apps — 6 MFEs (Free tier) ─────────────────────
for APP in "${MFE_APPS[@]}"; do
  APP_NAME="healthq-copilot-${APP}"
  echo "→ Creating Static Web App: $APP_NAME"
  az staticwebapp create \
    --name "$APP_NAME" \
    --resource-group "$RG" \
    --location "eastus2" \
    --sku Free \
    --output none

  TOKEN=$(az staticwebapp secrets list \
    --name "$APP_NAME" \
    --resource-group "$RG" \
    --query "properties.apiKey" -o tsv)
  
  SECRET_VAR="AZURE_STATIC_WEB_APPS_API_TOKEN_$(echo "$APP" | tr '[:lower:]-' '[:upper:]_')"
  echo "  ↳ Add GitHub secret: ${SECRET_VAR}=${TOKEN}"
done

# ── APIM Consumption (1M calls/month free) ────────────────────
echo "→ Creating APIM (Consumption tier): $APIM_NAME"
az apim create \
  --name "$APIM_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --publisher-name "$APIM_PUBLISHER_NAME" \
  --publisher-email "$APIM_PUBLISHER_EMAIL" \
  --sku-name Consumption \
  --output none

echo ""
echo "✅ Bootstrap complete."
echo ""
echo "Next steps:"
echo "  1. Add the GitHub secrets printed above for each SWA deploy token."
echo "  2. Set the OIDC secrets in GitHub:"
echo "       AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID"
echo "  3. Make GHCR packages public (or add GHCR_TOKEN secret) so ACA can pull:"
echo "       https://github.com/orgs/<owner>/packages"
echo "  4. Trigger the microservice-deploy workflow to push initial images."
echo "  5. Trigger the frontend-deploy workflow to publish MFE bundles."
