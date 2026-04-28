# AI Engineer Guide

This guide is for engineers extending AI orchestration, triage intelligence, and safety/governance capabilities.

## AI Scope in This Repository

- Clinical triage orchestration in the Agents service.
- Semantic Kernel plugin composition and workflow dispatch.
- RAG and episodic memory support.
- Model governance and drift monitoring.
- Human-in-the-loop (HITL) approval workflow integration with frontend.

## AI Code Map

| Area | Path | What You Will Change |
|---|---|---|
| Service wiring and model dependencies | [src/HealthQCopilot.Agents/Program.cs](../../src/HealthQCopilot.Agents/Program.cs) | DI registration, plugin registration, model endpoint setup |
| Plugin implementations | [src/HealthQCopilot.Agents/Plugins](../../src/HealthQCopilot.Agents/Plugins) | Domain tools for triage, coding, prior auth, care gaps |
| AI orchestration services | [src/HealthQCopilot.Agents/Services](../../src/HealthQCopilot.Agents/Services) | Planning loop, confidence routing, explainability, workflow dispatch |
| RAG services | [src/HealthQCopilot.Agents/Rag](../../src/HealthQCopilot.Agents/Rag) | Knowledge ingestion, retrieval, Qdrant integration |
| Governance and background monitors | [src/HealthQCopilot.Agents/BackgroundServices](../../src/HealthQCopilot.Agents/BackgroundServices) | Drift monitoring and long-running agent tasks |
| API and integration endpoints | [src/HealthQCopilot.Agents/Endpoints](../../src/HealthQCopilot.Agents/Endpoints) | Triage, model governance, demo, guide endpoints |
| HITL UI consumer | [frontend/apps/triage-mfe](../../frontend/apps/triage-mfe) | Human review/approval user experience |
| Realtime stream contract | [frontend/packages/web-pubsub-client/src/index.ts](../../frontend/packages/web-pubsub-client/src/index.ts) | Message envelope consumed by frontend |

## Local Development Workflow

### Full platform mode (recommended)

```bash
dotnet run --project src/HealthQCopilot.AppHost
cd frontend
pnpm dev
```

### AI service-focused mode

```bash
docker compose up -d postgres-agent redis qdrant
cd src/HealthQCopilot.Agents
dapr run --app-id agent-service --app-port 5002 \
  --resources-path ../../infra/dapr/components-local \
  -- dotnet run
```

## Safe Extension Workflow

When adding a new AI capability:

1. Add or extend a plugin under [src/HealthQCopilot.Agents/Plugins](../../src/HealthQCopilot.Agents/Plugins).
2. Register it in [src/HealthQCopilot.Agents/Program.cs](../../src/HealthQCopilot.Agents/Program.cs) within the kernel plugin collection.
3. Add orchestration behavior in [src/HealthQCopilot.Agents/Services](../../src/HealthQCopilot.Agents/Services).
4. Expose only required API surface in [src/HealthQCopilot.Agents/Endpoints](../../src/HealthQCopilot.Agents/Endpoints).
5. Add regression coverage in backend tests and relevant frontend triage tests.

## Governance and Reliability Hotspots

- Prompt and regression checks: `PromptRegressionEvaluator` and `PromptExperimentService`.
- Drift monitoring: `ModelDriftMonitorService`.
- Confidence and guard logic: `ConfidenceRouter` and `HallucinationGuardAgent`.
- Audit and security middleware are wired through shared infrastructure.

## AI Quality Gates to Watch

- [.github/workflows/pr-validation.yml](../../.github/workflows/pr-validation.yml)
- [.github/workflows/microservice-deploy.yml](../../.github/workflows/microservice-deploy.yml)
- [.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml)

## AI Change Checklist

- New prompts/tools have fallback behavior for low-confidence outputs.
- Triage-level decisions and escalation behavior are deterministic under tests.
- Frontend consumers can parse all streamed message shapes.
- Model behavior changes are covered by cloud E2E triage scenarios.

---

## Agentic-AI Gap-Closure Patterns (W1–W4)

The agentic-AI subsystem went through a structured gap-closure pass (Phase 1–3) that introduced several new orchestration and governance primitives. This section is the operator/contributor reference for those patterns. For HIPAA control mapping see [HIPAA-Agentic-AI-Evidence-Pack.md](../compliance/HIPAA-Agentic-AI-Evidence-Pack.md).

### Feature flags (FeatureManagement)

All new behaviour is gated. Flags live in `HealthQCopilot.ServiceDefaults.Features.HealthQFeatures`:

| Flag | Purpose | Default |
|---|---|---|
| `HealthQ:PhiRedaction` | Presidio-backed redaction in `RedactingLlmGateway` / `RedactingChatCompletionDecorator` | dev:on, prod:canary |
| `HealthQ:PatientConsentGate` | `IConsentService.CheckAsync` before LLM calls in `TriageOrchestrator` | dev:off, prod:on |
| `HealthQ:TokenAccounting` | `ITokenLedger` decorator emits `agent_tokens_total` + Cosmos rows | dev:on, prod:on |
| `HealthQ:AgentHandoff` | Multi-agent routing + episodic-memory recall in `AgentPlanningLoop` | off until canary |
| `HealthQ:CriticReview` | `CriticAgent` re-reads triage reasoning against RAG citations after the hallucination guard | off until canary |
| `HealthQ:ToolRbac` | `ToolPolicyFilter` enforces per-agent plugin allow-lists | off until allow-lists land |
| `HealthQ:ClinicalEval` | Continuous golden-set evaluator | off until W3 lands |

### Prompt registry

- Interface: `HealthQCopilot.Agents.Prompts.IAgentPromptRegistry` — sync `Get(promptId)` / `TryGet(...)`, returning `PromptDefinition(Id, Version, Template)`.
- Canonical ids: `InMemoryPromptRegistry.Ids.{TriageReasoning, HallucinationJudge, ClinicalCoder, CriticReviewer}`.
- Backends:
  - `InMemoryPromptRegistry` — seeded v1.0 prompts byte-identical to the strings previously hardcoded in `TriageOrchestrator` / `HallucinationGuardAgent` / `ClinicalCoderAgent` / `CriticAgent`.
  - `CosmosAgentPromptRegistry` (W4.5b) — when `Cosmos:Endpoint` is set, decorates the in-memory seed. Reads active `default`-tenant prompt from Cosmos partition `/promptKey`, falls back to in-memory on miss / failure. 5-minute lazy cache.
- **Hot-swap a prompt**: upsert a Cosmos doc `{ id: "{promptKey}:default:{version}", promptKey, tenantId:"default", version, body, active:true }` with `version` higher than the current active row, then flip the previous active row to `active:false`. Within 5 minutes (cache TTL) all pods serve the new version.
- The older async `HealthQCopilot.Infrastructure.AI.IPromptRegistry` (tenant-override registry) is a separate concept — it serves runtime tenant-specific prompt strings, not platform-wide agent prompts. Don't conflate them.

### Patient consent gate (W1.6)

`TriageOrchestrator.RunTriageAsync` calls `IConsentService.CheckAsync(sessionId, patientId, "triage", ct)` before any model inference when `HealthQ:PatientConsentGate` is on. On deny: deterministic `P3_Standard` triage + `consent-denied` `AuditEvent.AgentDecision` + early return. The default `DefaultConsentService` grants `platform-guide`/`demo` scopes and `SYN-*` synthetic patients; everything else denies. To wire a real consent registry, implement `IConsentService` and replace the DI registration in `Program.cs`.

### Audit chain-of-custody (W1.5 + W4.6)

Every triage produces three correlated `AuditEvent`s, all keyed on `sessionId`, all sent to Event Hubs:

1. `AuditEvent.PhiRedacted(sessionId, redactionEntityCount)` — emitted by `RedactingLlmGateway` per call.
2. `AuditEvent.AgentDecision(sessionId, triageLevel, guardApproved, modelId, promptId, promptVersion)` — `modelId` reads from `AzureOpenAI:DeploymentName`, `promptId/Version` reads from `IAgentPromptRegistry.Get(InMemoryPromptRegistry.Ids.TriageReasoning)`.
3. `AuditEvent.WorkflowDispatched(sessionId, ...)` — emitted on Dapr publish.

When you add a new agent, mirror this trio. The `AuditEvent.AgentDecision` factory parameters `modelId`/`modelVersion`/`promptId`/`promptVersion`/`redactionEntityCount` are all optional but should be stamped wherever the data is reachable.

### Critic agent (W2.3)

After the hallucination guard returns Safe but before `workflow.AssignTriage`, when `HealthQ:CriticReview` is on AND `ragContext` is non-empty, `TriageOrchestrator` builds a `RagCitation(SourceId="rag-triage-context", Title="Retrieved clinical protocols", Snippet=ragContext)` and calls `_critic.ReviewAsync(result.Reasoning, citations, ct)`. UNSUPPORTED → treated as guard rejection (rule-based fallback). The Critic returns Supported on LLM exception so the guard remains the ultimate gate. Metric: `agent_groundedness_score{agent="CriticAgent",verdict=...}`.

### Tool RBAC (W2.4)

`ToolPolicyFilter` (`IFunctionInvocationFilter`) reads `kernel.Data["agentName"]`, calls `IToolPolicyEnforcer.IsAllowedAsync(agent, plugin)`, throws `UnauthorizedAccessException` on deny. `AgentPlanningLoop` and `TriageOrchestrator` both seed `agentName` in `kernel.Data` at entry. Allow-list config lives under `AgentToolPolicy` in `appsettings.json`. Metric: `agent_tool_rbac_denied_total{agent, plugin}`.

### Episodic memory (W2.5)

`AgentPlanningLoop.RunAsync` calls `IEpisodicMemoryService.RecallSimilarDecisionsAsync(userGoal, topK:3, ct)` after seeding `kernel.Data` and **before** adding the user message — gated by `HealthQ:AgentHandoff`. Recalled decisions (Qdrant filter `guard_approved="True"`, scoreThreshold 0.75) are prepended as a system message: *"Relevant prior accepted decisions for similar cases (use only as context, never copy verbatim):"*. Storage is fire-and-forget at end-of-loop: `_ = _episodicMemory.StoreDecisionAsync(agentName, userGoal, finalAnswer, guardApproved:goalMet, ct)`. Blank-input and embedder-failure paths are no-ops (see `EpisodicMemoryServiceTests`).

### Loop budget (W2.6)

`AgentBudgetTracker` (Scoped) bounds every planning loop by `MaxIterations` (default 8), `MaxTokens` (16k), `MaxWallClockSeconds` (30). Defaults configurable under `AgentBudget`. On exhaustion, the loop appends `[BUDGET EXHAUSTED] {reason}` to reasoning steps, sets `outcome=budget_max_iterations | budget_max_tokens | budget_max_wall_clock`, and breaks with a partial result + `GoalMet=false`. **Never returns 500 on exhaustion.** Token usage is harvested via reflection on `Metadata["Usage"].InputTokenCount/OutputTokenCount` (mirrors the GuideOrchestrator pattern); returns `(0,0)` for streaming/mock LLMs.

### Common pitfalls

1. **`TriageLevel.P3_Routine` doesn't exist** — the enum is `P1_Immediate, P2_Urgent, P3_Standard, P4_NonUrgent`.
2. **Don't add `IPromptRegistry`** — that's the older async tenant-override interface. New agent prompts use `IAgentPromptRegistry`.
3. **`PromptDefinition.Version` is a string** (e.g. `"1.0"`, `"7.0"`), not an int.
4. **`InMemoryPromptRegistry` must remain registered** even when Cosmos is on — `CosmosAgentPromptRegistry` requires it as the inner fallback.
5. **`ICriticAgent` returns `Supported=true` on LLM exception** — by design; the hallucination guard is the integrity gate of last resort.
6. **Audit publish failures are non-fatal** — wrap in try/catch + `LogDebug`. Never let an Event Hubs hiccup fail a clinical decision.
7. **Tool RBAC bypass for raw prompts** — `ToolPolicyFilter` only intercepts plugin functions; un-pluggin'd prompts have no tool surface to gate, so the consent gate + redaction layer remain the prior controls.
