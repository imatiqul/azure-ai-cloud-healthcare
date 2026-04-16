<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# HealthQCopilot — Free Cloud Deployment Guide

## Overview

This guide deploys all 9 HealthQCopilot microservices and 5 micro-frontends using **\$0/month free tiers** across Azure (Static Web Apps, Container Apps, Application Insights, API Management), Supabase, and Auth0. The full production architecture (AKS + APIM + Azure Service Bus) is preserved for paid scale-up — this guide bootstraps the platform at zero cost.

***

## Free Tier Resource Map

| Component | Production Service | Free Tier Alternative | Limit |
| :-- | :-- | :-- | :-- |
| **Kubernetes (AKS)** | Azure AKS Standard | Azure Container Apps (Consumption) | 180,000 vCPU-sec/mo free |
| **PostgreSQL (×6 DBs)** | Azure PostgreSQL Flexible | Supabase Free | 500MB per project |
| **Redis** | Azure Cache for Redis | Upstash Redis | 10,000 req/day |
| **FHIR Server** | Azure Health Data Services | HAPI FHIR (self-hosted) | Unlimited (open source) |
| **Service Bus** | Azure Service Bus | Azure Service Bus Emulator (local) | Free (local only) |
| **AI Inference** | Azure AI Foundry Phi-4-Medical | GitHub Models (phi-4) | 150 req/day free |
| **Frontend Hosting (×5 MFEs)** | Azure Static Web Apps | Azure Static Web Apps Free | 100GB bandwidth/mo |
| **Auth** | Azure Entra ID | Auth0 Free | 7,500 MAU |
| **Observability** | Azure Monitor + App Insights | Azure Application Insights Free | 5GB ingestion/mo |
| **OCR / Document AI** | Azure Document Intelligence | Azure Free Tier (500 pages/mo) | 500 pages/mo |
| **Vector Search** | Azure AI Search | Qdrant Cloud Free | 1GB, 1 collection |
| **CI/CD** | GitHub Actions (self-hosted) | GitHub Actions Free | 2,000 min/mo |
| **API Gateway** | Azure API Management Standard | Azure API Management Consumption | 1M calls/mo free |


***

## Prerequisites

```bash
# Install required CLI tools
npm install -g pnpm@9           # Monorepo package manager
curl -fsSL https://get.docker.com | sh  # Docker Engine
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# .NET 9 SDK (choose your platform)
winget install Microsoft.DotNet.SDK.9        # Windows
# OR: brew install --cask dotnet-sdk         # macOS
# OR: sudo apt-get install -y dotnet-sdk-9.0 # Linux (Ubuntu/Debian)

# Azure CLI (required for Steps 8–11)
winget install Microsoft.AzureCLI            # Windows
# OR: brew install azure-cli                 # macOS
# OR: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash  # Linux

brew install dapr/tap/dapr-cli  # Dapr CLI (macOS)
# OR
wget -q https://raw.githubusercontent.com/dapr/cli/master/install/install.sh -O - | /bin/bash  # Linux

# Verify installations
docker --version       # Docker 26+
dotnet --version       # 9.0+
az --version           # 2.50+
dapr --version         # 1.14+
pnpm --version         # 9+
```


***

## Step 1 — Clone the Repository

```bash
git clone https://github.com/imatiqul/healthcare-ai
cd healthcare-ai

# Install all frontend dependencies via Turborepo
cd frontend && pnpm install && cd ..
```


***

## Step 2 — Provision Free-Tier Databases (Supabase)

Create **6 separate Supabase projects** (one per bounded context). Each has a 500MB free PostgreSQL instance.

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Create projects via Supabase dashboard at https://supabase.com/dashboard
# Projects needed:
#   healthq-copilot-voice
#   healthq-copilot-agent
#   healthq-copilot-fhir
#   healthq-copilot-scheduling
#   healthq-copilot-notification
#   healthq-copilot-pophealth
```

After creating each project, copy the **Connection String** from:
`Project Settings → Database → Connection String → URI`

Store each in `.env.local`:

> **Security:** Verify `.env.local` is listed in your `.gitignore` before proceeding — it contains database passwords and API tokens that must never be committed.

```env
# .env.local (root of project — never commit this file)
VOICE_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
AGENT_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
FHIR_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
SCHEDULING_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
NOTIFICATION_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
POPHEALTH_DB_CONNECTION=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```


***

## Step 3 — Start Local Infrastructure (Docker Compose)

The Docker Compose file emulates all Azure services locally for free:

```bash
# From the project root
docker compose up -d

# Services started:
# - Redis 7 (port 6379)
# - HAPI FHIR R4 Server (port 8080)
# - Qdrant vector DB (port 6333)
# - Azure Service Bus Emulator (port 5672)
# - Dapr Placement (port 50006)
# - Zipkin tracing UI (port 9411)
```

Verify all containers are healthy:

```bash
docker compose ps

# Expected output — all services should show "Up" status:
# healthcare-ai-redis-1              Up   0.0.0.0:6379->6379/tcp
# healthcare-ai-hapi-fhir-1          Up   0.0.0.0:8080->8080/tcp
# healthcare-ai-qdrant-1             Up   0.0.0.0:6333->6333/tcp
# healthcare-ai-servicebus-1         Up   0.0.0.0:5672->5672/tcp
# healthcare-ai-dapr-placement-1     Up   0.0.0.0:50006->50006/tcp
# healthcare-ai-zipkin-1             Up   0.0.0.0:9411->9411/tcp
```

Verify HAPI FHIR is running:

```bash
curl http://localhost:8080/fhir/metadata | jq '.fhirVersion'
# Expected: "4.0.1"
```


***

## Step 4 — Configure Free AI Inference (GitHub Models)

GitHub Models provides free access to `phi-4` (the open-weight equivalent of Phi-4-Medical) at **150 requests/day**:

```bash
# Generate a GitHub Personal Access Token at:
# https://github.com/settings/tokens → Fine-grained → Models: Read

# Add to .env.local
GITHUB_MODELS_TOKEN=ghp_your_token_here
GITHUB_MODELS_ENDPOINT=https://models.inference.ai.azure.com
AI_MODEL_NAME=Phi-4
```

Update `src/HealthQCopilot.Agents/Infrastructure/AiInferenceClient.cs` to use the GitHub Models endpoint:

```csharp
// Free tier: GitHub Models (Phi-4, 150 req/day)
// Upgrade path: Replace endpoint with Azure AI Foundry for production

var client = new AzureOpenAIClient(
    new Uri(config["GITHUB_MODELS_ENDPOINT"]!),
    new ApiKeyCredential(config["GITHUB_MODELS_TOKEN"]!)
);
```


***

## Step 5 — Configure Free Auth (Auth0)

Auth0 Free supports **7,500 Monthly Active Users** — more than enough for early traction:

```bash
# Sign up at https://auth0.com → Create Application → Regular Web Application
# Note your:
#   Domain:       your-tenant.us.auth0.com
#   Client ID:    abc123...
#   Client Secret: xyz789...

# Add to .env.local
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_AUDIENCE=https://api.healthqcopilot.com
NEXTAUTH_SECRET=generate_with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

Configure Auth0 Application URIs:

- **Allowed Callback URLs:** `http://localhost:3000/api/auth/callback/auth0`
- **Allowed Logout URLs:** `http://localhost:3000`
- **Allowed Web Origins:** `http://localhost:3000`

***

## Step 6 — Run the Microservices Locally (Dapr)

Run each microservice with a Dapr sidecar. Each service gets its own terminal or create a `run-all.sh` file at the project root with the contents below:

```bash
# run-all.sh — run all 8 services simultaneously
#!/bin/bash

services=(
  "voice-service:5001:src/HealthQCopilot.Voice"
  "ai-agent-service:5002:src/HealthQCopilot.Agents"
  "fhir-service:5003:src/HealthQCopilot.Fhir"
  "ocr-service:5004:src/HealthQCopilot.Ocr"
  "scheduling-service:5005:src/HealthQCopilot.Scheduling"
  "notification-service:5006:src/HealthQCopilot.Notifications"
  "pop-health-service:5007:src/HealthQCopilot.PopulationHealth"
  "identity-service:5008:src/HealthQCopilot.Identity"
)

for entry in "${services[@]}"; do
  IFS=':' read -r name port path <<< "$entry"
  echo "Starting $name on port $port..."
  dapr run \
    --app-id "$name" \
    --app-port "$port" \
    --dapr-http-port "$((port + 1000))" \
    --components-path ./infra/dapr/local \
    -- dotnet run --project "$path" --configuration Debug &
done

wait
```

```bash
# Make executable and run
chmod +x run-all.sh
./run-all.sh

# OR run a single service for development
cd src/HealthQCopilot.Voice
dapr run \
  --app-id voice-service \
  --app-port 5001 \
  --components-path ../../infra/dapr/local \
  -- dotnet run --configuration Debug
```

Verify all services are registered with Dapr:

```bash
dapr list
# Expected output:
# APP ID                 HTTP PORT  GRPC PORT  APP PORT  COMMAND        AGE
# voice-service          6001       50001       5001      dotnet run     1m
# ai-agent-service       6002       50002       5002      dotnet run     1m
# fhir-service           6003       50003       5003      dotnet run     1m
# ... (all 8 services)
```


***

## Step 7 — Run the Micro-Frontends Locally (Next.js / Vite)

```bash
cd frontend

# Start all 5 MFEs + Shell in parallel via Turborepo
pnpm dev

# Each MFE starts on its own port:
# Shell App        →  http://localhost:3000
# Voice MFE        →  http://localhost:3001
# Triage MFE       →  http://localhost:3002
# Scheduling MFE   →  http://localhost:3003
# Pop. Health MFE  →  http://localhost:3004
# Revenue MFE      →  http://localhost:3005
```

Add MFE remote URLs to `frontend/apps/shell/.env.local`:

```env
VOICE_MFE_URL=http://localhost:3001
TRIAGE_MFE_URL=http://localhost:3002
SCHEDULING_MFE_URL=http://localhost:3003
POPHEALTH_MFE_URL=http://localhost:3004
REVENUE_MFE_URL=http://localhost:3005
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your_client_id
```

Open `http://localhost:3000` — the full platform is now running locally at \$0 cost.

***

## Step 8 — Deploy Frontends to Azure Static Web Apps (Free)

Azure Static Web Apps Free tier provides **100GB bandwidth/month**, **2 custom domains**, and GitHub Actions CI/CD configured automatically on creation — the same service used in production:

```bash
# Login to Azure (az CLI must be installed — see Prerequisites)
az login

# Create resource group (one-time setup)
az group create \
  --name healthq-copilot-rg \
  --location eastus2

# Deploy Shell App
az staticwebapp create \
  --name healthq-copilot-shell \
  --resource-group healthq-copilot-rg \
  --source https://github.com/imatiqul/healthcare-ai \
  --branch main \
  --app-location "frontend/apps/shell" \
  --output-location ".next" \
  --sku Free

# Deploy each MFE as a separate Static Web App (repeat for each)
az staticwebapp create \
  --name healthq-copilot-voice-mfe \
  --resource-group healthq-copilot-rg \
  --source https://github.com/imatiqul/healthcare-ai \
  --branch main \
  --app-location "frontend/apps/voice-mfe" \
  --output-location "dist" \
  --sku Free

# Repeat for: triage-mfe, scheduling-mfe, pophealth-mfe, revenue-mfe
```

Azure Static Web Apps generates a GitHub Actions workflow automatically. Each app receives a URL in the format `https://<random>.azurestaticapps.net`. Set the Shell App environment variables:

```bash
az staticwebapp appsettings set \
  --name healthq-copilot-shell \
  --resource-group healthq-copilot-rg \
  --setting-names \
    VOICE_MFE_URL="https://healthq-copilot-voice-mfe.azurestaticapps.net" \
    TRIAGE_MFE_URL="https://healthq-copilot-triage-mfe.azurestaticapps.net" \
    SCHEDULING_MFE_URL="https://healthq-copilot-scheduling-mfe.azurestaticapps.net" \
    POPHEALTH_MFE_URL="https://healthq-copilot-pophealth-mfe.azurestaticapps.net" \
    REVENUE_MFE_URL="https://healthq-copilot-revenue-mfe.azurestaticapps.net" \
    NEXT_PUBLIC_API_URL="https://healthq-copilot-apim.azure-api.net" \
    NEXT_PUBLIC_AUTH0_DOMAIN="your-tenant.us.auth0.com" \
    NEXT_PUBLIC_AUTH0_CLIENT_ID="your_client_id"
```


***

## Step 9 — Deploy Backend Services to Azure Container Apps (Free)

Azure Container Apps Consumption free tier provides **180,000 vCPU-seconds + 360,000 GiB-seconds/month** — sufficient for demo/dev. This is the same service used in production so no migration is needed when scaling up:

```bash
# Create Container Apps environment (one-time)
az containerapp env create \
  --name healthq-copilot-env \
  --resource-group healthq-copilot-rg \
  --location eastus2

# Deploy each microservice as a Container App
# Images are built and pushed to ghcr.io by CI (see Step 13)
az containerapp create \
  --name voice-service \
  --resource-group healthq-copilot-rg \
  --environment healthq-copilot-env \
  --image ghcr.io/imatiqul/healthcare-ai/healthq-copilot/voice:latest \
  --target-port 5001 \
  --ingress internal \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 0.25 --memory 0.5Gi

# Repeat for each service, updating --name, --image, and --target-port:
# agents (5002), fhir (5003), ocr (5004), scheduling (5005),
# notifications (5006), pophealth (5007), identity (5008)
```

Set environment variables for each Container App:

```bash
az containerapp update \
  --name voice-service \
  --resource-group healthq-copilot-rg \
  --set-env-vars \
    VOICE_DB_CONNECTION="your_supabase_connection_string" \
    REDIS_CONNECTION="your_upstash_redis_url" \
    AUTH0_DOMAIN="your-tenant.us.auth0.com" \
    AUTH0_AUDIENCE="https://api.healthqcopilot.com" \
    GITHUB_MODELS_TOKEN="your_github_token" \
    ASPNETCORE_ENVIRONMENT="Production"
# Repeat for each service with its relevant DB connection variable
```

> **Scale-to-zero:** `--min-replicas 0` scales each app to zero when idle, keeping costs at \$0 during off-hours.


***

## Step 10 — Configure API Gateway (Azure API Management — Free)

Azure API Management Consumption tier provides **1,000,000 calls/month free** with no fixed hourly charge. It creates a unified entry point for all 8 backend services:

```bash
# Create APIM instance (Consumption tier — pay-per-call only, no fixed cost)
az apim create \
  --name healthq-copilot-apim \
  --resource-group healthq-copilot-rg \
  --location eastus2 \
  --publisher-email "your@email.com" \
  --publisher-name "HealthQ Copilot" \
  --sku-name Consumption

# Import each backend service as an API (repeat for each of the 8 services)
az apim api import \
  --resource-group healthq-copilot-rg \
  --service-name healthq-copilot-apim \
  --path "/voice" \
  --api-id voice-api \
  --service-url "https://voice-service.internal.<env-default-domain>.azurecontainerapps.io" \
  --specification-format OpenApi \
  --specification-path src/HealthQCopilot.Voice/openapi.json

# Get the unified gateway URL
az apim show \
  --name healthq-copilot-apim \
  --resource-group healthq-copilot-rg \
  --query "gatewayUrl" -o tsv
# Output: https://healthq-copilot-apim.azure-api.net
```

Point the Shell App at the gateway:

```bash
az staticwebapp appsettings set \
  --name healthq-copilot-shell \
  --resource-group healthq-copilot-rg \
  --setting-names \
    NEXT_PUBLIC_API_URL="https://healthq-copilot-apim.azure-api.net"
```


***

## Step 11 — Set Up Free Observability (Azure Application Insights)

Azure Application Insights provides **5GB data ingestion/month free** with 90-day retention. This is the production-target service — no migration needed when scaling up:

```bash
# Create Log Analytics Workspace
az monitor log-analytics workspace create \
  --resource-group healthq-copilot-rg \
  --workspace-name healthq-copilot-logs \
  --location eastus2

# Create Application Insights instance
az monitor app-insights component create \
  --app healthq-copilot-insights \
  --location eastus2 \
  --resource-group healthq-copilot-rg \
  --workspace healthq-copilot-logs

# Get the connection string
az monitor app-insights component show \
  --app healthq-copilot-insights \
  --resource-group healthq-copilot-rg \
  --query "connectionString" -o tsv
```

Set the connection string on each Container App:

```bash
az containerapp update \
  --name voice-service \
  --resource-group healthq-copilot-rg \
  --set-env-vars \
    APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=...;IngestionEndpoint=..."
# Repeat for all 8 services
```

`HealthQCopilot.ServiceDefaults` already configures OpenTelemetry to export to Application Insights when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set — no code changes required.

```bash
# View live metrics, distributed traces, and logs:
# Azure Portal → Resource Groups → healthq-copilot-rg → healthq-copilot-insights
open https://portal.azure.com
```


***

## Step 12 — Run the Full Test Suite

```bash
# From project root

# Backend unit tests (all 9 services)
dotnet test tests/HealthQCopilot.Tests.Unit \
  --collect:"XPlat Code Coverage" \
  --results-directory ./coverage
# Target: ≥80% coverage gate (CI enforced)

# Backend integration tests (Testcontainers — spins up real PostgreSQL + Redis)
dotnet test tests/HealthQCopilot.Tests.Integration

# Frontend E2E tests (Playwright)
cd frontend
pnpm exec playwright test

# Check coverage report
dotnet tool install -g dotnet-reportgenerator-globaltool
reportgenerator -reports:./coverage/**/coverage.cobertura.xml \
  -targetdir:./coverage/report \
  -reporttypes:Html
open ./coverage/report/index.html
```


***

## Step 13 — GitHub Actions CI/CD (Free Tier)

GitHub Actions Free provides **2,000 minutes/month**. The pipeline runs on every push to `main`:

```bash
# The pipeline is already configured at:
# .github/workflows/microservice-deploy.yml

# It performs 6 quality gates per service:
# Gate 1: dotnet build + dotnet format --verify-no-changes
# Gate 2: Unit tests with ≥80% coverage
# Gate 3: Integration tests (Testcontainers)
# Gate 4: Trivy container scan (blocks on CRITICAL CVEs)
# Gate 5: Build + push Docker image to GitHub Container Registry (ghcr.io — free)
# Gate 6: Deploy to Azure Container Apps via az containerapp update --image (see Step 9)

# Configure required GitHub Secrets:
# Settings → Secrets and variables → Actions → New repository secret
AZURE_CREDENTIALS      # Service principal JSON — create with command below
AZURE_RESOURCE_GROUP   # healthq-copilot-rg
AUTH0_DOMAIN           # Your Auth0 tenant domain
AUTH0_CLIENT_SECRET    # Your Auth0 client secret
GITHUB_MODELS_TOKEN    # Your GitHub Models PAT
```

Create the Azure service principal for GitHub Actions:

```bash
az ad sp create-for-rbac \
  --name healthq-copilot-deploy \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/healthq-copilot-rg \
  --sdk-auth
# Copy the JSON output → add as AZURE_CREDENTIALS secret in GitHub
```

Trigger your first deployment:

```bash
git add .
git commit -m "feat: initial HealthQCopilot deployment"
git push origin main

# Watch the pipeline at:
# https://github.com/imatiqul/healthcare-ai/actions
```


***

## Free Tier Limits \& Upgrade Triggers

| Metric | Free Tier Ceiling | Upgrade Trigger | Upgrade Path |
| :-- | :-- | :-- | :-- |
| **Concurrent users** | ~100 (ACA scale-to-zero) | >500 concurrent | Azure Container Apps Dedicated |
| **Database storage** | 500MB × 6 = 3GB (Supabase) | 80% capacity | Supabase Pro \$25/mo/project |
| **AI requests** | 150/day (GitHub Models) | Going live with patients | Azure AI Foundry pay-per-use |
| **Auth users** | 7,500 MAU (Auth0) | 5,000 MAU | Auth0 Essential \$23/mo |
| **Frontend bandwidth** | 100GB/mo (Azure Static Web Apps) | 80GB/mo | Azure SWA Standard \$9/mo |
| **Observability** | 5GB/mo (Application Insights) | Production monitoring | Azure Monitor pay-per-use |
| **API gateway calls** | 1M calls/mo (APIM Consumption) | >1M calls/mo | APIM Consumption \$3.50/million |


***

## HIPAA Compliance Note

> ⚠️ **Important:** The free-tier configuration above is suitable for **development and demos only**. Before handling real PHI (Protected Health Information), you must:
> - Sign a **Business Associate Agreement (BAA)** with each cloud provider
> - Supabase Pro (\$25/mo) — BAA available
> - Auth0 Enterprise — BAA available
> - Azure Static Web Apps — BAA available (covered under Microsoft Azure DPA)
> - Azure Container Apps — BAA available (covered under Microsoft Azure DPA)
> - Azure API Management — BAA available (covered under Microsoft Azure DPA)
> - Enable **PHI encryption** via the `PhiEncryptedString` value objects already built into the codebase
> - Activate **audit logging** via `PhiAuditMiddleware` in every FHIR-touching service

***

## Quick Reference — All Local URLs

| Service | URL | Purpose |
| :-- | :-- | :-- |
| Shell App | http://localhost:3000 | Main physician dashboard |
| Voice MFE | http://localhost:3001 | Ambient scribe + live transcript |
| Triage MFE | http://localhost:3002 | AI triage agent trace viewer |
| Scheduling MFE | http://localhost:3003 | Appointment calendar |
| Pop. Health MFE | http://localhost:3004 | Risk panel + care gaps |
| Revenue MFE | http://localhost:3005 | ICD-10 queue + RCM |
| HAPI FHIR Server | http://localhost:8080/fhir | FHIR R4 API |
| Zipkin Tracing | http://localhost:9411 | Distributed trace viewer |
| API Gateway | http://localhost:5000 | Backend entry point |
| Dapr Dashboard | http://localhost:8081 | Service mesh status |


***

*HealthQCopilot Deployment Guide — Free Azure Cloud Edition v2.0 | April 2026*

