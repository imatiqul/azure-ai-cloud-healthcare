using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.RealTime;
using Microsoft.EntityFrameworkCore;
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
    private readonly ILogger<TriageOrchestrator> _logger;

    public TriageOrchestrator(Kernel kernel, AgentDbContext db, WorkflowDispatcher dispatcher,
                               HallucinationGuardAgent guard, IWebPubSubService pubSub,
                               IEventHubAuditService auditService, ILogger<TriageOrchestrator> logger)
    {
        _kernel       = kernel;
        _db           = db;
        _dispatcher   = dispatcher;
        _guard        = guard;
        _pubSub       = pubSub;
        _auditService = auditService;
        _logger       = logger;
    }

    public async Task<TriageWorkflow> RunTriageAsync(Guid sessionId, string transcriptText, CancellationToken ct)
    {
        var workflow = TriageWorkflow.Create(Guid.NewGuid(), sessionId.ToString(), transcriptText);
        _db.TriageWorkflows.Add(workflow);

        // Track guard verdict across all code paths (true = safe or rule-based fallback)
        var guardApproved = true;

        // ── Stream AI reasoning to frontend before running the structured plugin ──────
        await StreamAiThinkingAsync(sessionId.ToString(), transcriptText, ct);

        var start = DateTime.UtcNow;
        try
        {
            var plugin = _kernel.Plugins["Triage"];
            var result = await _kernel.InvokeAsync<TriageClassification>(
                plugin["classify_urgency"],
                new KernelArguments { ["transcriptText"] = transcriptText },
                ct);

            if (result is not null)
            {
                // ── Hallucination guard before accepting the AI result ─────────
                var guardVerdict = await _guard.EvaluateAsync(result.Reasoning ?? string.Empty, ct);
                guardApproved = guardVerdict.IsSafe;

                if (guardVerdict.IsSafe)
                {
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
        var latency = DateTime.UtcNow - start;
        var decision = AgentDecision.Create(workflow.Id, "TriageAgent", transcriptText,
            $"Classified as {workflow.AssignedLevel}: {workflow.AgentReasoning}",
            isGuardApproved: guardApproved, latency);
        _db.AgentDecisions.Add(decision);

        await _db.SaveChangesAsync(ct);

        // ── Push final AgentResponse to connected frontend clients via Web PubSub ──
        var triageLevelText = workflow.AssignedLevel?.ToString() ?? "Unknown";
        var responseText = $"Triage complete: {triageLevelText}. {workflow.AgentReasoning}";

        _ = Task.Run(async () =>
        {
            await _pubSub.SendAgentResponseAsync(
                sessionId.ToString(), responseText, triageLevelText, guardApproved);

            // Publish audit event to Event Hubs
            await _auditService.PublishAsync(
                AuditEvent.AgentDecision(sessionId.ToString(), triageLevelText, guardApproved));
        }, CancellationToken.None);

        // Dispatch cross-service workflow events (fire-and-forget with structured error handling)
        _ = Task.Run(() => _dispatcher.DispatchAsync(workflow, CancellationToken.None), CancellationToken.None);

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

        var history = new ChatHistory();
        history.AddSystemMessage(
            "You are a senior emergency medicine physician performing real-time clinical triage. " +
            "Analyze the patient transcript step-by-step, explaining your clinical reasoning clearly. " +
            "Think aloud about symptoms, differentials, and urgency indicators. " +
            "Keep your analysis focused and clinical. Format: numbered reasoning steps.");
        history.AddUserMessage(
            $"Patient transcript for triage analysis:\n\n{transcriptText}\n\n" +
            "Walk through your clinical reasoning step by step before reaching a triage decision.");

        await _pubSub.SendAiThinkingAsync(sessionId, "🔍 Analyzing patient transcript...", isFinal: false, ct);
        _ = _auditService.PublishAsync(AuditEvent.AiThinkingStarted(sessionId), ct);

        var tokenBuffer = new System.Text.StringBuilder();
        var chunkCount = 0;

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
