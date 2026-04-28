using System.Collections.Concurrent;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Agents.Services.Orchestration;

/// <summary>
/// W2.1 — coordinates agent-to-agent handoffs in a multi-agent planning session.
/// Builds the <see cref="AgentHandoffEnvelope"/> from current session state,
/// decrements the shared budget, and emits a trace step. Handoff routing
/// decision is delegated to <see cref="IAgentRouter"/>.
/// </summary>
public interface IAgentHandoffCoordinator
{
    Task<AgentHandoffEnvelope> HandoffAsync(
        string sessionId,
        string tenantId,
        string fromAgent,
        string userIntent,
        double currentConfidence,
        IReadOnlyDictionary<string, string> sharedState,
        IReadOnlyList<RagCitation> citations,
        AgentBudgetSnapshot remainingBudget,
        CancellationToken ct = default);
}

public sealed class AgentHandoffCoordinator(
    IAgentRouter router,
    IAgentTraceRecorder traceRecorder,
    BusinessMetrics metrics,
    ILogger<AgentHandoffCoordinator> logger) : IAgentHandoffCoordinator
{
    // Tracks the cumulative number of handoffs within each active session so
    // the Histogram records the per-session depth rather than a raw call count.
    // Process-local — same sticky-session caveat as RedactingChatCompletionDecorator.
    private static readonly ConcurrentDictionary<string, int> _sessionDepth = new(StringComparer.Ordinal);
    public async Task<AgentHandoffEnvelope> HandoffAsync(
        string sessionId,
        string tenantId,
        string fromAgent,
        string userIntent,
        double currentConfidence,
        IReadOnlyDictionary<string, string> sharedState,
        IReadOnlyList<RagCitation> citations,
        AgentBudgetSnapshot remainingBudget,
        CancellationToken ct = default)
    {
        var decision = await router.RouteAsync(fromAgent, userIntent, currentConfidence, sharedState, ct);

        var envelope = new AgentHandoffEnvelope(
            sessionId,
            tenantId,
            fromAgent,
            decision.NextAgent,
            decision.Reason,
            userIntent,
            sharedState,
            citations,
            remainingBudget,
            DateTimeOffset.UtcNow);

        await traceRecorder.RecordStepAsync(sessionId, new AgentTraceStep(
            StepId: Guid.NewGuid().ToString("n"),
            ParentStepId: null,
            AgentName: fromAgent,
            Kind: "handoff",
            StartedAt: envelope.HandoffAt,
            CompletedAt: envelope.HandoffAt,
            Input: userIntent,
            Output: $"-> {decision.NextAgent} ({decision.Reason})",
            Citations: citations,
            Tokens: null,
            PromptId: null,
            PromptVersion: null,
            ModelId: null,
            ModelVersion: null,
            Verdict: null,
            Confidence: decision.Confidence), ct);

        // P4.2 — emit cumulative handoff depth for this session so the Argo
        // AnalysisTemplate can gate directly on agent_handoff_depth p95/p99.
        var depth = _sessionDepth.AddOrUpdate(sessionId, 1, (_, prev) => prev + 1);
        metrics.AgentHandoffDepth.Record(
            depth,
            new KeyValuePair<string, object?>("from_agent", fromAgent),
            new KeyValuePair<string, object?>("to_agent", decision.NextAgent));

        logger.LogInformation(
            "Agent handoff {From} -> {To} (reason={Reason}, conf={Conf:F2}, terminate={Terminate}, depth={Depth})",
            fromAgent, decision.NextAgent, decision.Reason, decision.Confidence, decision.TerminateLoop, depth);

        return envelope;
    }
}
