using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace HealthQCopilot.Agents.Services.Safety;

/// <summary>
/// W1.2 — guarded LLM gateway. Wraps an underlying SK <see cref="IChatCompletionService"/>
/// with a PHI redaction step (pre-prompt) and an output re-hydration step
/// (post-completion). Activated when <c>HealthQ:PhiRedaction</c> is enabled —
/// orchestrators call this facade in place of <c>IChatCompletionService</c>
/// directly, which would otherwise transmit raw PHI to Azure OpenAI.
///
/// W4.1 — when <c>HealthQ:TokenAccounting</c> is enabled, every completion is
/// recorded in <see cref="ITokenLedger"/> so the agent trace API and the cost
/// dashboard can report per-session token consumption.
/// </summary>
public interface IRedactingLlmGateway
{
    Task<RedactingLlmResult> CompleteAsync(
        ChatHistory history,
        Kernel kernel,
        string sessionId,
        string agentName,
        CancellationToken ct = default);

    /// <summary>
    /// Overload that forwards a <see cref="PromptExecutionSettings"/> bag to the
    /// underlying <see cref="IChatCompletionService"/> — required by orchestrators
    /// that rely on auto function-calling, max-token caps, or temperature tuning.
    /// </summary>
    Task<RedactingLlmResult> CompleteAsync(
        ChatHistory history,
        PromptExecutionSettings? settings,
        Kernel kernel,
        string sessionId,
        string agentName,
        CancellationToken ct = default);
}

public sealed record RedactingLlmResult(
    string Content,
    RedactionResult Redaction,
    int PromptTokens,
    int CompletionTokens,
    double LatencyMs);

public sealed class RedactingLlmGateway(
    IPhiRedactor redactor,
    ITokenLedger tokenLedger,
    IModelPricing pricing,
    IFeatureManager features,
    ILogger<RedactingLlmGateway> logger) : IRedactingLlmGateway
{
    public Task<RedactingLlmResult> CompleteAsync(
        ChatHistory history,
        Kernel kernel,
        string sessionId,
        string agentName,
        CancellationToken ct = default)
        => CompleteAsync(history, settings: null, kernel, sessionId, agentName, ct);

    public async Task<RedactingLlmResult> CompleteAsync(
        ChatHistory history,
        PromptExecutionSettings? settings,
        Kernel kernel,
        string sessionId,
        string agentName,
        CancellationToken ct = default)
    {
        var chat = kernel.GetRequiredService<IChatCompletionService>();

        // Redact every message body before transmission.
        var aggregateMap = new Dictionary<string, string>(StringComparer.Ordinal);
        var entities = new List<RedactionEntity>();
        string? strategy = null;
        var residualSuspected = false;
        var redacted = new ChatHistory();
        foreach (var msg in history)
        {
            var r = await redactor.RedactAsync(msg.Content ?? string.Empty, sessionId, ct);
            foreach (var kv in r.TokenMap) aggregateMap[kv.Key] = kv.Value;
            entities.AddRange(r.Entities);
            strategy ??= r.Strategy;
            residualSuspected |= r.ResidualPhiSuspected;
            redacted.AddMessage(msg.Role, r.RedactedText);
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var response = await chat.GetChatMessageContentAsync(redacted, settings, kernel, ct);
        sw.Stop();

        var rawContent = response.Content ?? string.Empty;
        var rehydrated = redactor.Rehydrate(rawContent, aggregateMap);

        // Best-effort token extraction. Real Azure OpenAI responses carry a "Usage"
        // object exposing InputTokenCount/OutputTokenCount; fakes/mocks may set
        // flat PromptTokens/CompletionTokens keys.
        var (promptTokens, completionTokens) = ExtractTokens(response.Metadata);

        if (entities.Count > 0)
        {
            logger.LogInformation(
                "RedactingLlmGateway: redacted {Count} PHI entities in session {SessionId} for {Agent} via {Strategy}.",
                entities.Count, sessionId, agentName, strategy ?? "none");
        }

        var aggregate = new RedactionResult(
            string.Empty,
            aggregateMap,
            entities,
            strategy ?? "none",
            residualSuspected);

        // W4.1 — token accounting (best effort; never break the request).
        if (await features.IsEnabledAsync(HealthQFeatures.TokenAccounting))
        {
            try
            {
                var modelId = TryGetString(response.Metadata, "ModelId", "Model") ?? "unknown";
                var modelVersion = TryGetString(response.Metadata, "ModelVersion", "SystemFingerprint", "Model");
                var record = new TokenUsageRecord(
                    SessionId: sessionId,
                    TenantId: string.Empty,
                    AgentName: agentName,
                    ModelId: modelId,
                    DeploymentName: modelId,
                    PromptId: null,
                    PromptVersion: null,
                    PromptTokens: promptTokens,
                    CompletionTokens: completionTokens,
                    TotalTokens: promptTokens + completionTokens,
                    EstimatedCostUsd: pricing.Estimate(modelId, promptTokens, completionTokens),
                    LatencyMs: sw.Elapsed.TotalMilliseconds,
                    CapturedAt: DateTimeOffset.UtcNow,
                    ModelVersion: modelVersion);
                await tokenLedger.RecordAsync(record, ct);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "RedactingLlmGateway: token-ledger record failed for session {SessionId}", sessionId);
            }
        }

        return new RedactingLlmResult(rehydrated, aggregate, promptTokens, completionTokens, sw.Elapsed.TotalMilliseconds);
    }

    private static (int Prompt, int Completion) ExtractTokens(IReadOnlyDictionary<string, object?>? meta)
    {
        if (meta is null) return (0, 0);

        // Real OpenAI SDK shape: meta["Usage"] => ChatTokenUsage { InputTokenCount, OutputTokenCount }.
        if (meta.TryGetValue("Usage", out var usage) && usage is not null)
        {
            var t = usage.GetType();
            var input = t.GetProperty("InputTokenCount")?.GetValue(usage) as int?
                        ?? t.GetProperty("PromptTokens")?.GetValue(usage) as int?
                        ?? 0;
            var output = t.GetProperty("OutputTokenCount")?.GetValue(usage) as int?
                         ?? t.GetProperty("CompletionTokens")?.GetValue(usage) as int?
                         ?? 0;
            if (input != 0 || output != 0) return (input, output);
        }

        // Flat-key fallback (used by tests and some custom connectors).
        return (TryGetInt(meta, "PromptTokens"), TryGetInt(meta, "CompletionTokens"));
    }

    private static int TryGetInt(IReadOnlyDictionary<string, object?> meta, string key)
    {
        if (meta.TryGetValue(key, out var v) && v is not null)
        {
            if (v is int i) return i;
            if (int.TryParse(v.ToString(), out var parsed)) return parsed;
        }
        return 0;
    }

    private static string? TryGetString(IReadOnlyDictionary<string, object?>? meta, params string[] keys)
    {
        if (meta is null) return null;
        foreach (var k in keys)
        {
            if (meta.TryGetValue(k, out var v) && v is not null)
            {
                var s = v.ToString();
                if (!string.IsNullOrEmpty(s)) return s;
            }
        }
        return null;
    }
}
