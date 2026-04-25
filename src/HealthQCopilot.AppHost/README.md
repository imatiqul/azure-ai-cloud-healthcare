# HealthQCopilot.AppHost

Microsoft Aspire orchestration project that launches the entire HealthQ Copilot platform — all 8 microservices, databases, caches, and third-party containers — with a single `dotnet run`.

## Why This Project Exists

Running 8 microservices + 8 PostgreSQL databases + Redis + HAPI FHIR + Qdrant locally is complex. Aspire eliminates this friction by defining the entire distributed application as code, with automatic service discovery, health monitoring, and a built-in dashboard for observability.

## Technology Choices

| Technology | Version | Why |
|---|---|---|
| **Aspire.AppHost.Sdk** | 9.0.0 | Provides the orchestration SDK for defining distributed apps |
| **Aspire.Hosting.AppHost** | 9.2.0 | Core hosting abstractions for projects, containers, and resources |
| **Aspire.Hosting.PostgreSQL** | 9.2.0 | Managed PostgreSQL containers with automatic connection string injection |
| **Aspire.Hosting.Redis** | 9.2.0 | Managed Redis container with health checks |
| **Aspire.Hosting.NodeJs** | 9.2.0 | Supports launching the Vite frontend monorepo via pnpm |

## What It Orchestrates

### Infrastructure
| Resource | Type | Details |
|---|---|---|
| PostgreSQL | Container | 1 server instance with 8 named databases (voice_db, agent_db, fhir_db, etc.) |
| PgAdmin | Container | Database management UI (auto-configured) |
| Redis | Container | Session state and caching |
| HAPI FHIR | Container | FHIR R4 server (hapiproject/hapi:v7.2.0) on port 8090 |
| Qdrant | Container | Vector database (qdrant/qdrant:v1.9.0) on ports 6333/6334 |

### Microservices
All 8 .NET services are launched as Aspire projects with automatic:
- Connection string injection (PostgreSQL + Redis)
- Service discovery (services can call each other by name)
- Health check monitoring
- External HTTP endpoint exposure

### Frontend
The Vite/pnpm frontend monorepo is launched via `AddNpmApp` with references to all backend services for service discovery.

## Running

```bash
# Start everything with the Aspire dashboard at https://localhost:15888
dotnet run --project src/HealthQCopilot.AppHost

# Or from this directory
dotnet run
```

## Environment Configuration

| Environment | How to Run |
|---|---|
| **Local (Aspire)** | `dotnet run` — launches all services, infra containers, and dashboard |
| **Local (Docker Compose)** | Deprecated — use Aspire AppHost. `docker-compose.yml` is kept for reference only. |
| **Staging / Production** | Services deploy to AKS via Helm; Aspire AppHost is not used in deployed environments |

## Aspire Dashboard

The dashboard (https://localhost:15888) provides:
- **Resources** — status of all services and containers
- **Console logs** — aggregated structured logs from every service
- **Traces** — distributed traces across service boundaries (via OpenTelemetry)
- **Metrics** — runtime and HTTP metrics per service
