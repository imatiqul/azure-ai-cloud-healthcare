using System.Diagnostics;
using Dapr.Client;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Prompts;
using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace HealthQCopilot.Agents.Services;

public sealed class TriageOrchestrator
{
    private readonly Kernel _kernel;
    private readonly AgentDbContext _db;
    private readonly WorkflowDispatcher _dispatcher;
    private readonly HallucinationGuardAgent _guard;
    private readonly IWebPubSubService _pubSub;
    private readonly IEventHubAuditService _auditService;
    private readonly DaprClient _dapr;
    private readonly IRagContextProvider? _rag;
    private readonly ILlmUsageTracker _usageTracker;
    private readonly ConfidenceRouter _confidenceRouter;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IFeatureManager _features;
    private readonly IPhiRedactor _phiRedactor;
    private readonly IAgentPromptRegistry _prompts;
    private readonly IConsentService _consent;
    private readonly IConfiguration _config;
    private readonly ICriticAgent _critic;
    private readonly ILogger<TriageOrchestrator> _logger;

    public TriageOrchestrator(Kernel kernel, AgentDbContext db, WorkflowDispatcher dispatcher,
                               HallucinationGuardAgent guard, IWebPubSubService pubSub,
                               IEventHubAuditService auditService, DaprClient dapr,
                               ILlmUsageTracker usageTracker,
                               ConfidenceRouter confidenceRouter,
                               IHttpContextAccessor httpContextAccessor,
                               IFeatureManager features,
                               IPhiRedactor phiRedactor,
                               IAgentPromptRegistry prompts,
                               IConsentService consent,
                               IConfiguration config,
                               ICriticAgent critic,
                               ILogger<TriageOrchestrator> logger,
                               IRagContextProvider? rag = null)
    {
        _kernel = kernel;
        _db = db;
        _dispatcher = dispatcher;
        _guard = guard;
        _pubSub = pubSub;
        _auditService = auditService;
        _dapr = dapr;
        _usageTracker = usageTracker;
        _confidenceRouter = confidenceRouter;
        _httpContextAccessor = httpContextAccessor;
        _features = features;
        _phiRedactor = phiRedactor;
        _prompts = prompts;
        _consent = consent;
        _config = config;
        _critic = critic;
        _rag = rag;
        _logger = logger;
    }

    public async Task<TriageWorkflow> RunTriageAsync(Guid sessionId, string transcriptText, string patientId, CancellationToken ct)
    {
        var workflow = TriageWorkflow.Create(Guid.NewGuid(), sessionId.ToString(), transcriptText, patientId);
        _db.TriageWorkflows.Add(workflow);

        // W1.6 — patient consent gate. Before any LLM call, verify the patient
        // has authorized AI-assisted triage. On deny we record a deterministic
        // P3 (routine) workflow with a non-AI reasoning string + audit event
        // and short-circuit — no PHI leaves the process for inference.
        // Gated by HealthQ:PatientConsentGate so the existing prod path is
        // unchanged until ops opt in.
        if (await _features.IsEnabledAsync(HealthQFeatures.PatientConsentGate))
        {
            var consent = await _consent.CheckAsync(
                sessionId.ToString(), patientId, scope: "triage", ct);
            if (!consent.Granted)
            {
                _logger.LogInformation(
                    "Triage consent denied for session {SessionId} (reason={Reason}); returning non-AI fallback.",
                    sessionId, consent.Reason);

                workflow.AssignTriage(
                    TriageLevel.P3_Standard,
                    "AI-assisted triage was not performed because the patient has not consented to AI processing. "
                    + "Please complete an in-person clinical assessment.");

                try
                {
                    // W1.6b — dedicated ConsentDecision audit event (was previously
                    // shoehorned into AgentDecision with triageLevel="consent-denied").
                    // Stable EventType="consent_decision" makes the Kusto compliance
                    // queries (right-of-access reports) much simpler.
                    await _auditService.PublishAsync(
                        AuditEvent.ConsentDecision(
                            sessionId.ToString(),
                            patientId: patientId,
                            scope: "triage",
                            granted: false,
                            reason: consent.Reason,
                            grantedBy: consent.GrantedBy,
                            grantedAt: consent.GrantedAt),
                        ct);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Consent-denied audit publish failed (non-fatal)");
                }

                await _db.SaveChangesAsync(ct);
                return workflow;
            }
        }

        // W5.2 — tag the kernel so LiveToolEventFilter can stream ToolInvoked/ToolCompleted
        // events to the right Web PubSub session group.
        _kernel.Data["sessionId"] = sessionId.ToString();
        _kernel.Data["agentName"] = "TriageAgent";

        // Track guard verdict across all code paths (true = safe or rule-based fallback)
        var guardApproved = true;

        // ── Stream AI reasoning to frontend before running the structured plugin ──────
        await StreamAiThinkingAsync(sessionId.ToString(), transcriptText, ct);

        // ── Retrieve relevant clinical protocols from Qdrant to enrich the triage call ──
        var ragEnabled = await _features.IsEnabledAsync(HealthQFeatures.RagRetrieval);
        var ragContext = ragEnabled && _rag is not null
            ? await _rag.GetRelevantContextAsync(transcriptText, topK: 3, ct: ct)
            : string.Empty;

        var enrichedTranscript = string.IsNullOrEmpty(ragContext)
            ? transcriptText
            : transcriptText + Environment.NewLine + Environment.NewLine + ragContext;

        var sw = Stopwatch.StartNew();
        try
        {
            var plugin = _kernel.Plugins["Triage"];
            var functionResult = await _kernel.InvokeAsync(
                plugin["classify_urgency"],
                new KernelArguments { ["transcriptText"] = enrichedTranscript },
                ct);

            // Track LLM token usage for cost attribution
            var tenantId = _httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault() ?? "default";
            // Note: classify_urgency is a rule-based KernelFunction (no LLM tokens).
            // LLM tokens are tracked separately in StreamAiThinkingAsync.
            _usageTracker.TrackUsage(0, 0, "TriageAgent", tenantId, sw.Elapsed.TotalMilliseconds);

            var result = functionResult?.GetValue<TriageClassification>();
            if (result is not null)
            {
                // ── Hallucination guard before accepting the AI result ─────────
                var guardEnabled = await _features.IsEnabledAsync(HealthQFeatures.HallucinationGuard);
                var guardVerdict = guardEnabled
                    ? await _guard.EvaluateAsync(result.Reasoning ?? string.Empty, ct)
                    : new GuardVerdict(GuardOutcome.Safe, []);
                guardApproved = guardVerdict.IsSafe;

                if (guardVerdict.IsSafe)
                {
                    // W2.3 — cross-agent CriticAgent. Verifies the AI reasoning is
                    // supported by retrieved RAG citations before commit. When the
                    // critic is disabled, no RAG context was fetched, or no citations
                    // are available the critic returns NotApplicable (Supported=true)
                    // and the existing path is unchanged.
                    var criticEnabled = await _features.IsEnabledAsync(HealthQFeatures.CriticReview);
                    if (criticEnabled && !string.IsNullOrEmpty(ragContext))
                    {
                        var citations = new[]
                        {
                            new RagCitation(
                                SourceId: "rag-triage-context",
                                Title: "Retrieved clinical protocols",
                                Url: null,
                                Score: 1.0,
                                Snippet: ragContext)
                        };
                        var critique = await _critic.ReviewAsync(result.Reasoning ?? string.Empty, citations, ct);
                        if (!critique.Supported)
                        {
                            _logger.LogWarning(
                                "Critic rejected triage reasoning for session {SessionId}. Reason: {Reason}. Falling back to rule-based.",
                                sessionId, critique.Reason);
                            guardApproved = false;
                            // Fall through to the rule-based fallback below by skipping the AssignTriage block.
                            goto guardOrCriticRejected;
                        }
                    }

                    workflow.AssignTriage(result.Level, result.Reasoning ?? string.Empty);
                    _logger.LogInformation(
                        "Triage completed for session {SessionId}: {Level} - {Reasoning}",
                        sessionId, result.Level, result.Reasoning);
                    goto triageComplete;
                }

                _logger.LogWarning(
                    "Guard rejected triage reasoning for session {SessionId}. Findings: {Findings}. Falling back to rule-based.",
                    sessionId, string.Join(", ", guardVerdict.Findings));
            }

        guardOrCriticRejected:
            // null result or guard-rejected: fall back to rule-based plugin
            var fallback = new TriagePlugin();
            var classification = fallback.ClassifyUrgency(transcriptText);
            workflow.AssignTriage(classification.Level, classification.Reasoning);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Semantic Kernel triage failed for session {SessionId}, using fallback", sessionId);
            var fallback = new TriagePlugin();
            var classification = fallback.ClassifyUrgency(transcriptText);
            workflow.AssignTriage(classification.Level, classification.Reasoning);
            // Rule-based fallback is safe by definition
            guardApproved = true;
        }

    triageComplete:
        sw.Stop();
        var latency = sw.Elapsed;

        var decision = AgentDecision.Create(workflow.Id, "TriageAgent", transcriptText,
            $"Classified as {workflow.AssignedLevel}: {workflow.AgentReasoning}",
            isGuardApproved: guardApproved, latency);
        _db.AgentDecisions.Add(decision);

        // ── Confidence-based routing (Phase 39) ───────────────────────────────
        // Estimate confidence from the outcome path:
        //   AI + guard-approved → moderate-high confidence (0.72)
        //   AI guard-rejected / rule-based fallback → low confidence (0.48)
        // The XaiExplainabilityService provides calibrated confidence post-decision.
        var estimatedConfidence = guardApproved ? 0.72 : 0.48;
        var routing = _confidenceRouter.Route(estimatedConfidence, patientId, workflow.Id);
        if (routing == ConfidenceRoutingDecision.AutoEscalate)
        {
            workflow.Escalate();
        }

        await _db.SaveChangesAsync(ct);

        // ── Push final AgentResponse to connected frontend clients via Web PubSub ──
        var triageLevelText = workflow.AssignedLevel?.ToString() ?? "Unknown";
        var responseText = $"Triage complete: {triageLevelText}. {workflow.AgentReasoning}";

        _ = Task.Run(async () =>
        {
            await _pubSub.SendAgentResponseAsync(
                sessionId.ToString(), responseText, triageLevelText, guardApproved);

            // Publish audit event to Event Hubs — W4.6: stamp model + prompt id/version
            // so an auditor can correlate the AI decision back to the exact deployment
            // and prompt template used. modelVersion is per-response (captured in the
            // token ledger / trace step), not available at this emission site.
            var triagePrompt = _prompts.Get(InMemoryPromptRegistry.Ids.TriageReasoning);
            var modelId = _config["AzureOpenAI:DeploymentName"];
            // W1.5b — read the cumulative masked-entity count from the SK decorator's
            // session-scoped map. Stamps a single rolling number on the decision audit
            // so an auditor sees both the per-call PhiRedacted rows AND the totals
            // captured at decision time, all keyed on sessionId.
            var redactionEntityCount = HealthQCopilot.Agents.Services.Safety.RedactingChatCompletionDecorator
                .GetSessionMaskedCount(sessionId.ToString());
            await _auditService.PublishAsync(
                AuditEvent.AgentDecision(
                    sessionId.ToString(),
                    triageLevelText,
                    guardApproved,
                    modelId: modelId,
                    promptId: triagePrompt.Id,
                    promptVersion: triagePrompt.Version,
                    redactionEntityCount: redactionEntityCount > 0 ? redactionEntityCount : null));
        }, CancellationToken.None);

        // Dispatch cross-service workflow events (fire-and-forget with structured error handling)
        _ = Task.Run(() => _dispatcher.DispatchAsync(workflow, patientId, CancellationToken.None), CancellationToken.None);

        // Publish domain events to Dapr pub/sub so downstream subscribers can react
        _ = Task.Run(async () =>
        {
            try
            {
                var topicName = workflow.Status == WorkflowStatus.AwaitingHumanReview
                    ? "escalation.required"
                    : "triage.completed";
                await _dapr.PublishEventAsync("pubsub", topicName, new
                {
                    WorkflowId = workflow.Id,
                    SessionId = workflow.SessionId,
                    PatientId = patientId,
                    Level = workflow.AssignedLevel?.ToString(),
                    Reasoning = workflow.AgentReasoning
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to publish triage event to Dapr pub/sub for session {SessionId}",
                    workflow.SessionId);
            }
        }, CancellationToken.None);

        return workflow;
    }

    /// <summary>
    /// Streams Azure OpenAI reasoning tokens to the frontend via Web PubSub,
    /// giving users real-time visibility into the AI's clinical decision process.
    /// </summary>
    private async Task StreamAiThinkingAsync(string sessionId, string transcriptText, CancellationToken ct)
    {
        IChatCompletionService? chatService;
        try
        {
            chatService = _kernel.GetRequiredService<IChatCompletionService>();
        }
        catch
        {
            // Azure OpenAI not configured — skip streaming
            return;
        }

        // W1.2 — PHI redaction before any prompt leaves the process for Azure OpenAI.
        // HIPAA technical safeguard (45 CFR § 164.312(a)(1)): mask SSN/MRN/PHONE/EMAIL/DOB.
        var promptText = transcriptText;
        if (await _features.IsEnabledAsync(HealthQFeatures.PhiRedaction))
        {
            var redaction = await _phiRedactor.RedactAsync(transcriptText, sessionId, ct);
            promptText = redaction.RedactedText;
            if (redaction.Entities.Count > 0)
            {
                _logger.LogInformation(
                    "PHI redactor masked {Count} entities for session {SessionId} before LLM call.",
                    redaction.Entities.Count, sessionId);

                // W1.5 — proof-of-redaction audit (counts only; never raw values)
                var kindCounts = redaction.Entities
                    .GroupBy(e => e.EntityType)
                    .ToDictionary(g => g.Key, g => g.Count());
                _ = _auditService.PublishAsync(
                    AuditEvent.PhiRedacted(sessionId, "TriageAgent", redaction.Entities.Count, kindCounts),
                    ct);
            }
        }

        var history = new ChatHistory();
        // W4.5 — system prompt sourced from the prompt registry so we can roll the
        // wording forward without redeploying agent code; v1.0 is byte-identical
        // to the previous hard-coded string.
        history.AddSystemMessage(_prompts.Get(InMemoryPromptRegistry.Ids.TriageReasoning).Template);
        history.AddUserMessage(
            $"Patient transcript for triage analysis:\n\n{promptText}\n\n" +
            "Walk through your clinical reasoning step by step before reaching a triage decision.");

        await _pubSub.SendAiThinkingAsync(sessionId, "🔍 Analyzing patient transcript...", isFinal: false, ct);
        _ = _auditService.PublishAsync(AuditEvent.AiThinkingStarted(sessionId), ct);

        var tokenBuffer = new System.Text.StringBuilder();
        var chunkCount = 0;
        var streamSw = Stopwatch.StartNew();
        var tenantId = _httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault() ?? "default";

        try
        {
            await foreach (var chunk in chatService.GetStreamingChatMessageContentsAsync(
                history, cancellationToken: ct))
            {
                var token = chunk.Content ?? string.Empty;
                if (string.IsNullOrEmpty(token)) continue;

                tokenBuffer.Append(token);
                chunkCount++;

                // Batch every 3 tokens to reduce Web PubSub calls while keeping UI responsive
                if (chunkCount % 3 == 0)
                {
                    await _pubSub.SendAiThinkingAsync(sessionId, tokenBuffer.ToString(), isFinal: false, ct);
                    tokenBuffer.Clear();
                }
            }

            // Flush any remaining tokens
            if (tokenBuffer.Length > 0)
                await _pubSub.SendAiThinkingAsync(sessionId, tokenBuffer.ToString(), isFinal: false, ct);

            // Signal that streaming is complete
            await _pubSub.SendAiThinkingAsync(sessionId, string.Empty, isFinal: true, ct);

            // Track approximate LLM usage (streaming chunks ≈ tokens)
            streamSw.Stop();
            _usageTracker.TrackUsage(promptTokens: chunkCount * 4, completionTokens: chunkCount,
                "TriageAgent-Stream", tenantId, streamSw.Elapsed.TotalMilliseconds);

            _logger.LogInformation(
                "AI thinking stream completed for session {SessionId}: {ChunkCount} chunks",
                sessionId, chunkCount);
        }
        catch (OperationCanceledException)
        {
            // Request cancelled — nothing to do
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI thinking stream interrupted for session {SessionId}", sessionId);
            await _pubSub.SendAiThinkingAsync(sessionId, " [AI stream interrupted — proceeding with triage]", isFinal: true, ct);
        }
    }
}
