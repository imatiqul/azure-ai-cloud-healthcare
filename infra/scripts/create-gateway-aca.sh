#!/bin/bash
# Create the API Gateway ACA container app
# Run this once to provision the container app before CI/CD can deploy to it.
# The gateway is the only service with external ingress — all other services
# are internal and reachable only within the ACA environment.

RESOURCE_GROUP="healthq-copilot-rg"
ACA_ENV="healthq-copilot-env"
SERVICE_NAME="gateway"
IMAGE="mcr.microsoft.com/dotnet/aspnet:9.0"

APPINSIGHTS_CONN=$(az monitor app-insights component show \
  --app healthq-copilot-insights \
  --resource-group "$RESOURCE_GROUP" \
  --query connectionString -o tsv 2>/dev/null || echo "")

echo "Creating ACA container app: $SERVICE_NAME (external ingress)"

az containerapp create \
  --name "$SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --image "$IMAGE" \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars \
    "ASPNETCORE_ENVIRONMENT=Production" \
    "APPLICATIONINSIGHTS_CONNECTION_STRING=${APPINSIGHTS_CONN}"

echo "Gateway ACA container app created. CI/CD will update the image on next push."
echo ""
echo "FQDN: $(az containerapp show --name $SERVICE_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)"
