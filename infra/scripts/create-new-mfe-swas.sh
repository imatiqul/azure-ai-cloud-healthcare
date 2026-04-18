#!/bin/bash
# Provision Azure Static Web Apps for the two new MFEs:
#   - encounters-mfe  (patient encounter history)
#   - engagement-mfe  (patient portal / care gap / notifications)
#
# Run this ONCE after adding them to the codebase.
# After running, add the printed deploy tokens as GitHub secrets:
#   ENCOUNTERS_MFE_DEPLOY_TOKEN
#   ENGAGEMENT_MFE_DEPLOY_TOKEN
# Then also add the printed SWA URLs as GitHub secrets so the shell build
# and cloud E2E workflow can reference the real URLs:
#   ENCOUNTERS_MFE_URL   (full URL with /remoteEntry.js suffix)
#   ENGAGEMENT_MFE_URL   (full URL with /remoteEntry.js suffix)
#   ENCOUNTERS_SWA_URL   (base URL without path)
#   ENGAGEMENT_SWA_URL   (base URL without path)

RESOURCE_GROUP="healthq-copilot-rg"
LOCATION="eastus2"

NEW_MFES=(encounters-mfe engagement-mfe)

for APP in "${NEW_MFES[@]}"; do
  APP_NAME="healthq-copilot-${APP}"
  echo "→ Creating Static Web App: $APP_NAME"

  az staticwebapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Free \
    --output none

  TOKEN=$(az staticwebapp secrets list \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.apiKey" -o tsv)

  HOSTNAME=$(az staticwebapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query defaultHostname -o tsv)

  SECRET_VAR="$(echo "$APP" | tr '[:lower:]-' '[:upper:]_')_DEPLOY_TOKEN"
  URL_VAR="$(echo "$APP" | tr '[:lower:]-' '[:upper:]_')_URL"
  SWA_URL_VAR="$(echo "$APP" | tr '[:lower:]-' '[:upper:]_' | sed 's/_MFE_URL$/_SWA_URL/')_URL"

  echo ""
  echo "  ✓ $APP_NAME provisioned"
  echo "    GitHub secret: ${SECRET_VAR} = ${TOKEN}"
  echo "    GitHub secret: ${URL_VAR} = https://${HOSTNAME}/remoteEntry.js"
  echo "    GitHub secret: ENCOUNTERS_SWA_URL / ENGAGEMENT_SWA_URL = https://${HOSTNAME}"
  echo ""
done

echo "✅ Done. Add the secrets above to GitHub → Settings → Secrets → Actions."
