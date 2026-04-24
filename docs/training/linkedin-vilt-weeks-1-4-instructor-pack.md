# Weeks 1 to 4 Instructor Pack

This document turns the first month of the course into instructor-ready material with detailed slide structure, lab flow, checkpoints, and delivery notes.

## How To Use This Pack

1. Treat the slide outline as the minimum viable lecture deck.
2. Treat the lab instructions as the live delivery script for the guided lab.
3. Reuse the stakeholder guides and diagram library as pre-reads and visual support.
4. Keep week 1 focused on platform orientation, week 2 on backend reasoning, week 3 on runtime operations, and week 4 on edge composition.

## Shared Instructor Preparation

Before teaching weeks 1 to 4, prepare the following once:

1. Verify local startup with the commands in [../../README.md](../../README.md).
2. Confirm the first-month repo anchors still open cleanly in VS Code.
3. Pre-render the core architecture visuals from [../diagrams/README.md](../diagrams/README.md).
4. Prepare a fallback recording for any demo path that depends on local browser permissions or unstable machine state.

## Week 1: Platform Orientation and Environment Setup

### Teaching outcome

Learners understand what the platform contains, why it is taught as a platform problem, and how to run the full system locally.

### Slide outline

| Slide | Title | Main talking points | Evidence or visual |
|---|---|---|---|
| 1 | Course promise | Explain that the course teaches production AI platform delivery, not isolated tools | [linkedin-vilt-course-plan.md](linkedin-vilt-course-plan.md) |
| 2 | What is in this repo | Show backend, frontend, infra, tests, docs, and workflows | [../../README.md](../../README.md) |
| 3 | Why healthcare AI becomes a platform problem | Voice, triage, human review, downstream systems, and release safety all cross disciplines | [../diagrams/live-demo-flow.mmd](../diagrams/live-demo-flow.mmd) |
| 4 | Runtime topology | Explain AppHost, databases, Redis, Qdrant, HAPI FHIR, services, gateway, BFF, and frontend shell | [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) |
| 5 | Service inventory | Call out the identity, voice, agents, FHIR, OCR, scheduling, notifications, population health, and revenue services | [../../src](../../src) |
| 6 | Frontend topology | Explain shell plus 7 remote MFEs and why that matters for workflow ownership | [../../frontend/apps](../../frontend/apps) |
| 7 | Local developer workflow | Show the startup path, prerequisites, and where most learners get blocked | [../../README.md](../../README.md) |
| 8 | How to navigate the docs | Show stakeholder guides, diagrams, training docs, and workflows | [../stakeholders/README.md](../stakeholders/README.md) |
| 9 | End-to-end workflow preview | Walk voice to triage to review to downstream actions at a high level | [../diagrams/architecture-one-breath.mmd](../diagrams/architecture-one-breath.mmd) |
| 10 | Week 1 lab briefing | Tell learners exactly what they must prove by the end of the lab | This document |

### Guided lab

#### Objective

Get the full local platform running and produce a simple topology note that proves the learner understands the runtime layout.

#### Prerequisites

1. .NET 9 SDK with Aspire workload.
2. Docker Desktop with Compose v2.
3. Dapr CLI.
4. Node.js 20+ and pnpm 9+.

#### Repo anchors

- [../../README.md](../../README.md)
- [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs)
- [../stakeholders/README.md](../stakeholders/README.md)

#### Lab steps

1. Open [../../README.md](../../README.md) and review the prerequisite list and startup commands.
2. In the repo root, run:

```bash
dotnet run --project src/HealthQCopilot.AppHost
```

3. In a second terminal, run:

```bash
cd frontend
pnpm install
pnpm dev
```

4. Use the AppHost output and [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) to identify the infrastructure services, backend services, gateway, BFF, and frontend shell.
5. Open [../stakeholders/README.md](../stakeholders/README.md) and map at least three stakeholder guides to the parts of the runtime they care about.
6. Produce a one-page topology note or whiteboard screenshot with five labeled areas: infrastructure, backend services, API edge, frontend shell/remotes, and training docs.

#### Success evidence

The learner can explain which file defines the local runtime topology, name at least five running services, and identify where the shell enters the backend.

#### Common failure points

1. Missing Aspire workload or Dapr CLI.
2. Frontend dependencies not installed before `pnpm dev`.
3. Learners reading the repo tree without using AppHost as the runtime source of truth.

#### Stretch prompt

Ask learners to explain why the platform uses both a gateway and a BFF before they have seen those files in detail.

## Week 2: DDD and Backend Service Boundaries

### Teaching outcome

Learners understand where domain rules live, how aggregates raise events, and how infrastructure turns those events into reliable cross-service behavior.

### Slide outline

| Slide | Title | Main talking points | Evidence or visual |
|---|---|---|---|
| 1 | Why domain boundaries matter here | Explain why voice, agents, scheduling, and FHIR should not collapse into one service | [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) |
| 2 | Domain layer purpose | Show the domain project as the business-rule source of truth | [../../src/HealthQCopilot.Domain/README.md](../../src/HealthQCopilot.Domain/README.md) |
| 3 | Aggregate and event pattern | Show aggregates raising domain events instead of calling downstream services directly | [../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs](../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs) |
| 4 | Real event chain | Walk `TranscriptProduced`, `TriageCompleted`, and `EscalationRequired` | [../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs](../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs) |
| 5 | Infrastructure layer role | Explain persistence, outbox, messaging, observability, and resilience | [../../src/HealthQCopilot.Infrastructure/README.md](../../src/HealthQCopilot.Infrastructure/README.md) |
| 6 | Why outbox matters | Connect reliable event publication to healthcare workflow safety | [../../src/HealthQCopilot.Infrastructure/README.md](../../src/HealthQCopilot.Infrastructure/README.md) |
| 7 | Event subscribers in the repo | Show the agents and scheduling subscriber controllers as evidence of cross-service workflow handling | [../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs](../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs) |
| 8 | Architectural review lens | Show what good service-boundary reasoning sounds like in code review | [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md) |
| 9 | Backend quality gates | Connect domain changes to unit and integration tests | [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) |
| 10 | Week 2 lab briefing | Tell learners they will trace one complete domain-event workflow | This document |

### Guided lab

#### Objective

Trace one business event from aggregate creation to downstream handling and explain why the design is event-first rather than tightly coupled HTTP.

#### Repo anchors

- [../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs](../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs)
- [../../src/HealthQCopilot.Domain/Voice/Events/TranscriptProduced.cs](../../src/HealthQCopilot.Domain/Voice/Events/TranscriptProduced.cs)
- [../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs](../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs)
- [../../src/HealthQCopilot.Domain/Agents/Events/TriageCompleted.cs](../../src/HealthQCopilot.Domain/Agents/Events/TriageCompleted.cs)
- [../../src/HealthQCopilot.Domain/Agents/Events/EscalationRequired.cs](../../src/HealthQCopilot.Domain/Agents/Events/EscalationRequired.cs)
- [../../src/HealthQCopilot.Infrastructure/README.md](../../src/HealthQCopilot.Infrastructure/README.md)
- [../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs](../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs)
- [../../src/HealthQCopilot.Scheduling/Controllers/SchedulingSubscriberController.cs](../../src/HealthQCopilot.Scheduling/Controllers/SchedulingSubscriberController.cs)

#### Lab steps

1. Open [../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs](../../src/HealthQCopilot.Domain/Voice/VoiceSession.cs) and locate where the aggregate raises `TranscriptProduced`.
2. Open [../../src/HealthQCopilot.Domain/Voice/Events/TranscriptProduced.cs](../../src/HealthQCopilot.Domain/Voice/Events/TranscriptProduced.cs) and capture the event payload.
3. Open [../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs](../../src/HealthQCopilot.Agents/Controllers/AgentSubscriberController.cs) and identify how the agents service subscribes to that event.
4. Open [../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs](../../src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs) and identify where `TriageCompleted` and `EscalationRequired` are raised.
5. Open [../../src/HealthQCopilot.Scheduling/Controllers/SchedulingSubscriberController.cs](../../src/HealthQCopilot.Scheduling/Controllers/SchedulingSubscriberController.cs) and note one downstream consumer of `TriageCompleted`.
6. Read the transactional outbox section in [../../src/HealthQCopilot.Infrastructure/README.md](../../src/HealthQCopilot.Infrastructure/README.md) and write two sentences explaining why the outbox matters for this event chain.
7. Submit a workflow trace with four boxes: aggregate, event, subscriber, downstream action.

#### Success evidence

The learner can point to the exact file where the event is raised, the exact file where it is consumed, and explain why reliable delivery matters.

#### Common failure points

1. Confusing domain events with HTTP DTOs.
2. Treating the infrastructure layer as business logic rather than transport and reliability plumbing.
3. Describing synchronous service calls when the repo uses event-driven collaboration.

#### Stretch prompt

Ask learners to compare `TriageCompleted` and `EscalationRequired` and explain why one drives normal workflow progress while the other encodes governance escalation.

## Week 3: Local Distributed Runtime with Aspire, Compose, and Dapr

### Teaching outcome

Learners understand the difference between full-platform development and service-focused loops, and can explain how local infrastructure supports both.

### Slide outline

| Slide | Title | Main talking points | Evidence or visual |
|---|---|---|---|
| 1 | Why local runtime strategy matters | Full platform versus service-focused loops is a productivity decision, not just a tooling choice | [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) |
| 2 | AppHost as topology source | Show how AppHost wires infrastructure and services together | [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) |
| 3 | Infra stack for local work | Postgres, Redis, Qdrant, HAPI FHIR, and why each exists | [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) |
| 4 | Dapr in the local story | Pub/sub and service identity for focused loops | [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) |
| 5 | Compose versus Aspire | Explain when to lean on Compose and when to lean on AppHost | [../../docker-compose.yml](../../docker-compose.yml) |
| 6 | Example focused loop | Show the Voice service example with local Dapr resources | [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) |
| 7 | Observability and troubleshooting | Explain logs, health, and resilience expectations in local work | [../../src/HealthQCopilot.Infrastructure/README.md](../../src/HealthQCopilot.Infrastructure/README.md) |
| 8 | Common developer bottlenecks | Missing dependencies, stale containers, wrong working directory, service assumptions | This document |
| 9 | Choosing the right loop | Give heuristics for feature work, debugging, and platform reviews | [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md) |
| 10 | Week 3 lab briefing | Learners will compare a full run to a focused service run | This document |

### Guided lab

#### Objective

Run the platform one way with AppHost and one way with a focused Voice service loop, then explain the tradeoffs.

#### Repo anchors

- [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs)
- [../../docker-compose.yml](../../docker-compose.yml)
- [../../infra/dapr](../../infra/dapr)
- [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md)

#### Lab steps

1. Start the full distributed application from the repo root:

```bash
dotnet run --project src/HealthQCopilot.AppHost
```

2. Record which infrastructure dependencies appear in the AppHost topology.
3. Stop the full run and start only the dependencies required for a focused backend loop:

```bash
docker compose up -d postgres-voice redis
```

4. Start the Voice service with Dapr:

```bash
cd src/HealthQCopilot.Voice
dapr run --app-id voice-service --app-port 5001 --resources-path ../../infra/dapr/components-local -- dotnet run
```

5. Compare the two approaches across four dimensions: startup cost, dependency visibility, debugging speed, and realism.
6. Write a short runbook with one paragraph on when to choose AppHost and one paragraph on when to choose the focused loop.

#### Success evidence

The learner can explain what AppHost provides that the focused loop does not, and what the focused loop improves for day-to-day development.

#### Common failure points

1. Running service-specific commands from the wrong directory.
2. Forgetting to start Redis or the service database before the focused loop.
3. Assuming the focused loop provides the same observability picture as the full platform.

#### Stretch prompt

Ask learners which workflow types should always be validated again in full-platform mode before a pull request is merged.

## Week 4: API Gateway and GraphQL BFF Patterns

### Teaching outcome

Learners understand why the platform separates reverse proxy responsibilities from aggregated query responsibilities, and can trace the edge composition model using real files.

### Slide outline

| Slide | Title | Main talking points | Evidence or visual |
|---|---|---|---|
| 1 | Why the edge layer is split | One edge surface does not need to own every concern | [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md) |
| 2 | Gateway responsibilities | Show YARP, service discovery, SignalR hub, and default endpoints | [../../src/HealthQCopilot.Gateway/Program.cs](../../src/HealthQCopilot.Gateway/Program.cs) |
| 3 | BFF responsibilities | Show typed downstream HTTP clients and GraphQL server setup | [../../src/HealthQCopilot.BFF/Program.cs](../../src/HealthQCopilot.BFF/Program.cs) |
| 4 | When to proxy versus aggregate | Explain pass-through route concerns versus cross-service composition | [../../src/HealthQCopilot.Gateway/appsettings.json](../../src/HealthQCopilot.Gateway/appsettings.json) |
| 5 | Why GraphQL exists here | Support aggregated query paths for frontend experiences | [../../src/HealthQCopilot.BFF/Program.cs](../../src/HealthQCopilot.BFF/Program.cs) |
| 6 | Real-time edge case | Show why `GlobalHub` is hosted locally on the gateway | [../../src/HealthQCopilot.Gateway/Program.cs](../../src/HealthQCopilot.Gateway/Program.cs) |
| 7 | Data loaders and downstream services | Highlight PopHealth, Agents, Revenue, Scheduling, and FHIR clients | [../../src/HealthQCopilot.BFF/Program.cs](../../src/HealthQCopilot.BFF/Program.cs) |
| 8 | Frontend implications | Explain what the shell and remotes gain from a stable edge contract | [../stakeholders/frontend-engineers.md](../stakeholders/frontend-engineers.md) |
| 9 | Review checklist | Show how architects should evaluate new edge changes | [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md) |
| 10 | Week 4 lab briefing | Learners will build an edge ownership map | This document |

### Guided lab

#### Objective

Create a simple ownership map that distinguishes reverse proxy routes, GraphQL aggregation, and real-time hub responsibilities.

#### Repo anchors

- [../../src/HealthQCopilot.Gateway/Program.cs](../../src/HealthQCopilot.Gateway/Program.cs)
- [../../src/HealthQCopilot.Gateway/appsettings.json](../../src/HealthQCopilot.Gateway/appsettings.json)
- [../../src/HealthQCopilot.BFF/Program.cs](../../src/HealthQCopilot.BFF/Program.cs)
- [../stakeholders/frontend-engineers.md](../stakeholders/frontend-engineers.md)
- [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md)

#### Lab steps

1. Open [../../src/HealthQCopilot.Gateway/Program.cs](../../src/HealthQCopilot.Gateway/Program.cs) and note the calls to `AddReverseProxy`, `MapHub<GlobalHub>("/hubs/global")`, and `MapReverseProxy()`.
2. Open [../../src/HealthQCopilot.Gateway/appsettings.json](../../src/HealthQCopilot.Gateway/appsettings.json) and inventory the configured proxy routes and clusters.
3. Open [../../src/HealthQCopilot.BFF/Program.cs](../../src/HealthQCopilot.BFF/Program.cs) and list the downstream service clients plus the `/graphql` and `/healthz` endpoints.
4. If the platform is running locally, open the shell in the browser and use the network tab to look for requests that target `graphql` and `hubs/global`.
5. Produce an edge ownership map with three columns: proxied routes, aggregated GraphQL queries, and real-time hub traffic.
6. Write one sentence on why a future feature should go through the BFF and one sentence on why another feature should stay a proxied backend route.

#### Success evidence

The learner can explain what the gateway owns, what the BFF owns, and why those responsibilities should remain separate.

#### Common failure points

1. Assuming GraphQL replaces every proxied route.
2. Treating the gateway as a generic application service instead of an edge component.
3. Forgetting that the gateway also hosts the shared SignalR hub.

#### Stretch prompt

Ask learners whether a new dashboard feature should query multiple services through the BFF or call one service through the gateway, and require them to justify the choice.
