# HealthQ Copilot — HIPAA Agentic AI Evidence Pack

**Version**: 1.0  
**Scope**: HealthQ Copilot agentic-AI subsystem (Triage / Coding / Care-gap / Critic / Hallucination Guard)  
**Last Reviewed**: 2026-04-27 (Phase 3 hardening — P3.4)  
**HIPAA Sections in scope**: § 164.308 (Administrative), § 164.312 (Technical), § 164.514 (De-identification)

This evidence pack supplements the SOC 2 / HITRUST / ISO 27001 control mappings already published under [docs/compliance/](./SOC2-HITRUST-Control-Mapping.md) by collecting the **agentic-AI-specific** safeguards: PHI redaction before model inference, patient-consent gating, end-to-end audit linkage, prompt and model version chain-of-custody, and tool RBAC.

---

## 1. Scope & Threat Model

The agentic-AI subsystem performs LLM-assisted triage, clinical coding, and care-gap discovery. The HIPAA exposure surface is:

1. **PHI-in-prompt** — patient transcripts, chart text, and FHIR fragments could be sent to an external model service.
2. **PHI-in-trace** — agent traces, audit events, and metrics could leak identifiers if instrumented naively.
3. **Inappropriate inference** — a missing or revoked patient consent could result in AI processing of PHI without authorization.
4. **Tool-call abuse** — auto-function-calling could invoke a plugin (e.g. `lookup_patient`) that an agent role has not been authorized to use.
5. **Provenance gap** — an audit row without `model_id` / `prompt_id` / `prompt_version` cannot be linked back to the exact decision artifact, breaking § 164.312(b) audit-control requirements.

---

## 2. Control Matrix — HIPAA Safeguards → Implemented Controls

| HIPAA § | Safeguard | Agentic-AI Control | Evidence Location |
|---|---|---|---|
| 164.308(a)(4)(ii)(B) | Access authorization | Patient-consent gate (W1.6) — `IConsentService.CheckAsync(sessionId, patientId, scope:"triage")` runs before any LLM call; deny path returns deterministic non-AI response | [src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs](../../src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs), [tests/HealthQCopilot.Tests.Unit/Agents/DefaultConsentServiceTests.cs](../../tests/HealthQCopilot.Tests.Unit/Agents/DefaultConsentServiceTests.cs) |
| 164.308(a)(1)(ii)(D) | Information system activity review | Audit chain-of-custody: `AuditEvent.PhiRedacted` → `AuditEvent.AgentDecision` → `AuditEvent.WorkflowDispatched`, all keyed on `sessionId` and emitted to Event Hubs | [src/HealthQCopilot.Infrastructure/Messaging/AuditEvent.cs](../../src/HealthQCopilot.Infrastructure/Messaging/AuditEvent.cs) |
| 164.312(a)(1) | Access control — unique user identification | Every audit row carries `sessionId` + `userId` (Entra OID); tool RBAC resolves role from `kernel.Data["agentName"]` | [src/HealthQCopilot.Agents/Infrastructure/ToolPolicyFilter.cs](../../src/HealthQCopilot.Agents/Infrastructure/ToolPolicyFilter.cs) |
| 164.312(a)(2)(iv) | Encryption & decryption | Cosmos DB CMK; TLS 1.2 to Azure OpenAI; APIM enforces mTLS to model backends | [infra/bicep/modules/cosmos.bicep](../../infra/bicep/modules/cosmos.bicep), [infra/bicep/modules/apim.bicep](../../infra/bicep/modules/apim.bicep) |
| 164.312(b) | Audit controls | `AuditEvent.AgentDecision` factory stamps `modelId`, `promptId`, `promptVersion` (W4.6); tokens + cost stamped per-call by `RedactingChatCompletionDecorator` | [src/HealthQCopilot.Infrastructure/Messaging/AuditEvent.cs](../../src/HealthQCopilot.Infrastructure/Messaging/AuditEvent.cs), [src/HealthQCopilot.Infrastructure/AI/RedactingChatCompletionDecorator.cs](../../src/HealthQCopilot.Infrastructure/AI/RedactingChatCompletionDecorator.cs) |
| 164.312(c)(1) | Integrity | Hallucination guard (LLM-as-judge SAFE/UNSAFE) + Critic agent (citation-supported verdict) gate every accepted decision; rule-based fallback on rejection | [src/HealthQCopilot.Agents/Services/HallucinationGuardAgent.cs](../../src/HealthQCopilot.Agents/Services/HallucinationGuardAgent.cs), [src/HealthQCopilot.Agents/Services/Orchestration/CriticAgent.cs](../../src/HealthQCopilot.Agents/Services/Orchestration/CriticAgent.cs) |
| 164.312(e)(1) | Transmission security | All Azure OpenAI traffic egresses through APIM diagnostic logging; PHI-redaction decorator scrubs inputs before TLS handshake | [src/HealthQCopilot.Infrastructure/AI/RedactingLlmGateway.cs](../../src/HealthQCopilot.Infrastructure/AI/RedactingLlmGateway.cs) |
| 164.514(b)(2) | Safe Harbor de-identification | Microsoft Presidio NER strips 18 HIPAA identifiers; redaction count emitted as `AuditEvent.PhiRedacted` per call | [src/HealthQCopilot.Infrastructure/AI/PresidioRedactor.cs](../../src/HealthQCopilot.Infrastructure/AI/PresidioRedactor.cs) |

---

## 3. PHI Redaction Proof

### 3.1 Pipeline

```
patient-transcript ──► RedactingLlmGateway
                         │
                         ├── 1. PresidioRedactor.RedactAsync(input)
                         │      └─► returns { redacted, entityCounts }
                         │
                         ├── 2. AuditEvent.PhiRedacted(sessionId, entityCounts)
                         │      └─► Event Hubs → SOC SIEM
                         │
                         └── 3. IChatCompletionService.GetChatMessageContentsAsync(redacted, …)
                                └─► Azure OpenAI (no raw PHI on the wire)
```

### 3.2 Test coverage

- `PresidioRedactorTests` — pins the Safe-Harbor identifier list (PERSON, US_SSN, DATE_TIME, MEDICAL_RECORD_NUMBER, PHONE_NUMBER, EMAIL_ADDRESS, US_DRIVER_LICENSE, IP_ADDRESS, LOCATION, …).
- `RedactingChatCompletionDecoratorTests` — proves no un-redacted text reaches the inner `IChatCompletionService` and that `[REDACTED:KIND]` placeholders are deterministic.
- `RedactingLlmGatewayTests` — end-to-end gateway contract: redacted input + token-ledger record + `PhiRedacted` audit event.

### 3.3 Production verification (P3.3 dependency)

APIM diagnostic-log query (Application Insights):

```kusto
ApiManagementGatewayLogs
| where TimeGenerated > ago(1h)
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"\b\d{3}-\d{2}-\d{4}\b"   // SSN pattern
   or  RequestBody matches regex @"\b[A-Z]{2}\d{6}\b"        // MRN pattern
   or  RequestBody matches regex @"\b\(\d{3}\)\s\d{3}-\d{4}\b" // phone
| count
```

**Acceptance**: `count == 0` over a 1-hour synthetic-traffic test window. Captured under [docs/compliance/runbooks/phi-egress-verification.md](./runbooks/phi-egress-verification.md) (TBD; created at canary cutover under P4.1).

---

## 4. Patient Consent Gate

### 4.1 Behaviour

- Flag: `HealthQ:PatientConsentGate` (off in dev, on in stage/prod).
- When **on**, `TriageOrchestrator.RunTriageAsync` calls `IConsentService.CheckAsync(sessionId, patientId, "triage", ct)` **before** any model inference.
- On **deny**:
  - `TriageWorkflow.AssignTriage(P3_Standard, "AI-assisted triage was not performed because the patient has not consented to AI processing. Please complete an in-person clinical assessment.")` — fully deterministic.
  - `AuditEvent.AgentDecision(sessionId, triageLevel:"consent-denied", guardApproved:false, …)` published.
  - **No PHI leaves the process for inference** on the deny path.
- `DefaultConsentService` fail-safe contract: `platform-guide` / `demo` scopes always granted; `SYN-*` (synthetic) patient ids always granted; everything else denied with reason `"no-consent-provider-configured"` until a registry-backed implementation is wired.

### 4.2 Test coverage

[tests/HealthQCopilot.Tests.Unit/Agents/DefaultConsentServiceTests.cs](../../tests/HealthQCopilot.Tests.Unit/Agents/DefaultConsentServiceTests.cs) — 5 tests covering grant/deny contract.

---

## 5. Audit Chain-of-Custody

Every triage workflow produces three correlated audit events keyed on `sessionId`:

| Order | Factory | Stamps |
|---|---|---|
| 1 | `AuditEvent.PhiRedacted(sessionId, entityCounts)` | per-kind counts of redacted entities |
| 2 | `AuditEvent.AgentDecision(sessionId, triageLevel, guardApproved, modelId, promptId, promptVersion)` | LLM model + prompt artifact (W4.6) |
| 3 | `AuditEvent.WorkflowDispatched(sessionId, …)` | downstream Dapr pub/sub publish |

All three flow to the same Event Hub stream and are queryable by `sessionId` from the SOC SIEM. The Critic agent's `agent_groundedness_score{agent="CriticAgent",verdict=…}` metric provides the auxiliary signal for § 164.312(c)(1) integrity verification (W2.3 + W3.6 dashboard).

**Open item (W1.5b, deferred)**: `redactionEntityCount` is currently only on `PhiRedacted`, not on `AgentDecision`. Threading the count through `Kernel.Data` would put it on the decision row directly. Tracked under W1.5b backlog.

---

## 6. Prompt & Model Provenance

- `IAgentPromptRegistry` — sync registry returning `PromptDefinition(Id, Version, Template)`.
- Backends:
  - **Dev / test**: `InMemoryPromptRegistry` — v1.0 prompts byte-identical to the strings previously hardcoded.
  - **Production**: `CosmosAgentPromptRegistry` (W4.5b) — reads active `default`-tenant prompt from Cosmos partition `/promptKey`, falls back to in-memory seed on miss/error. 5-minute lazy cache.
- Stamping: `TriageOrchestrator` reads the active `TriageReasoning` prompt and `AzureOpenAI:DeploymentName` config, then writes both into `AuditEvent.AgentDecision` (W4.6).
- Hot-swap: a new prompt version can be activated by upserting a Cosmos doc with `active=true` and a higher `version`. Within 5 minutes (cache TTL) all pods serve the new version. The old version remains queryable in Cosmos for audit reconstruction.

### 6.1 Test coverage

- `InMemoryPromptRegistryTests` (7 tests) — id resolution, missing-id throw, optional-fallback contract.
- `CosmosAgentPromptRegistryTests` (4 tests) — Cosmos-doc-present, Cosmos-empty fallback, CosmosException fallback, cache-hit on second call.

---

## 7. Tool RBAC (W2.4)

- Flag: `HealthQ:ToolRbac`.
- `ToolPolicyFilter` (`IFunctionInvocationFilter`) intercepts every plugin function invocation; resolves agent identity from `kernel.Data["agentName"]`; delegates to `IToolPolicyEnforcer.IsAllowedAsync(agent, plugin)`; throws `UnauthorizedAccessException` on deny so SK aborts the auto-function-call chain.
- Metric: `agent_tool_rbac_denied_total{agent, plugin}` — alerts on any unexpected deny (which would indicate a misconfigured allow-list or a prompt-injection attempt steering the agent toward an unauthorized tool).

---

## 8. Loop Budget Enforcement (W2.6)

`AgentBudgetTracker` enforces three limits per planning loop: `MaxIterations` (8), `MaxTokens` (16k), `MaxWallClockSeconds` (30). On exhaustion, the loop returns a partial result with `outcome=budget_max_iterations | budget_max_tokens | budget_max_wall_clock` — never a 500. This bounds blast radius for adversarial inputs (long inputs, tool-call loops, prompt-injection-induced infinite reasoning).

---

## 9. Verification Checklist (Phase 3 Acceptance)

- [x] PHI redaction unit tests green (`PresidioRedactorTests`, `RedactingChatCompletionDecoratorTests`, `RedactingLlmGatewayTests`).
- [x] Consent gate denies real-patient PHI scope and grants synthetic / platform-guide scopes (`DefaultConsentServiceTests`).
- [x] Audit factory stamps `modelId`/`promptId`/`promptVersion` (`AuditEventTests.AgentDecision_includes_model_and_prompt_metadata_when_provided`).
- [x] Cosmos prompt registry falls back to in-memory seed on storage failure (`CosmosAgentPromptRegistryTests`).
- [x] Tool RBAC denies unauthorized plugin calls and emits the deny metric (`ToolPolicyFilterTests`).
- [x] Loop budget enforcement returns partial result on iteration / token / wall-clock exhaustion (`AgentBudgetTrackerTests`).
- [ ] APIM diagnostic-log Kusto query returns 0 PHI matches over 1-hour synthetic window (P3.3 — runbook captured at canary cutover).
- [ ] End-to-end agent journey integration test (P3.1 — pending).

---

## 10. Change Log

| Date | Change | Author |
|---|---|---|
| 2026-04-27 | Initial publication. Covers W1.5 / W1.6 / W2.3 / W2.4 / W2.5 / W2.6 / W4.5 / W4.5b / W4.6. | Platform Compliance |
