using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace HealthQCopilot.Agents.Services.Safety;

/// <summary>
/// W1.2 — kernel-level <see cref="IChatCompletionService"/> decorator.
///
/// Unlike <see cref="RedactingLlmGateway"/> (a per-orchestrator facade), this
/// decorator wraps the SK chat completion registration itself. Every call SK
/// makes — including auto-invoke tool loops, planner reflection, and streaming —
/// passes through here transparently, so PHI cannot leak via paths that bypass
/// the gateway.
///
/// Redaction is idempotent: each call re-redacts every message in the history,
/// which is a no-op for already-masked content but catches new tool-call outputs
/// (e.g., FHIR PatientPlugin responses) that SK appends between iterations.
///
/// A per-session token map is kept in <see cref="Kernel.Data"/> via the
/// <c>sessionId</c> tag set by orchestrators (see W5.2 LiveToolEventFilter
/// convention) so output rehydration can reconstruct PHI for the originating
/// caller. When no <c>sessionId</c> is present the decorator falls back to a
/// per-call map.
///
/// W4.1 — when <c>HealthQ:TokenAccounting</c> is on, every non-streaming
/// completion records a <see cref="TokenUsageRecord"/> via <see cref="ITokenLedger"/>.
/// </summary>
public sealed class RedactingChatCompletionDecorator(
    IChatCompletionService inner,
    IPhiRedactor redactor,
    ITokenLedger tokenLedger,
    IModelPricing pricing,
    IFeatureManager features,
    ILogger<RedactingChatCompletionDecorator> logger,
    IAgentTraceRecorder? traceRecorder = null) : IChatCompletionService
{
    private static readonly ConcurrentDictionary<string, Dictionary<string, string>> SessionMaps = new();

    /// <summary>
    /// W1.5b — returns the cumulative count of distinct PHI entities masked
    /// across all LLM calls for <paramref name="sessionId"/>, or 0 if the
    /// session is unknown (no LLM call has run, or redaction was disabled).
    /// Stamped onto the <c>AuditEvent.AgentDecision</c> at the end of the
    /// triage workflow so the chain-of-custody record carries proof that
    /// redaction actually fired and how many entities it covered, alongside
    /// the existing per-call <c>AuditEvent.PhiRedacted</c> rows.
    /// </summary>
    public static int GetSessionMaskedCount(string sessionId)
        => SessionMaps.TryGetValue(sessionId, out var map) ? map.Count : 0;

    public IReadOnlyDictionary<string, object?> Attributes => inner.Attributes;

    public async Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
        ChatHistory chatHistory,
        PromptExecutionSettings? executionSettings = null,
        Kernel? kernel = null,
        CancellationToken cancellationToken = default)
    {
        var (sessionId, agentName) = ResolveContext(kernel);
        var redactionEnabled = await features.IsEnabledAsync(HealthQFeatures.PhiRedaction);

        Dictionary<string, string>? tokenMap = null;
        string? strategy = null;
        if (redactionEnabled)
        {
            tokenMap = GetOrCreateSessionMap(sessionId);
            strategy = await RedactInPlaceAsync(chatHistory, sessionId, tokenMap, cancellationToken);
        }

        var startedAt = DateTimeOffset.UtcNow;
        var sw = Stopwatch.StartNew();
        var responses = await inner.GetChatMessageContentsAsync(chatHistory, executionSettings, kernel, cancellationToken);
        sw.Stop();
        var completedAt = DateTimeOffset.UtcNow;

        if (redactionEnabled && tokenMap is { Count: > 0 })
        {
            for (var i = 0; i < responses.Count; i++)
            {
                var content = responses[i].Content;
                if (string.IsNullOrEmpty(content)) continue;
                var rehydrated = redactor.Rehydrate(content, tokenMap);
                if (!ReferenceEquals(rehydrated, content))
                {
                    responses[i].Content = rehydrated;
                }
            }
        }

        TokenUsageRecord? usageRecord = null;
        if (responses.Count > 0)
        {
            var (prompt, completion) = ExtractTokens(responses[0].Metadata);
            var modelId = TryGetString(responses[0].Metadata, "ModelId", "Model") ?? "unknown";
            var modelVersion = TryGetString(responses[0].Metadata, "ModelVersion", "SystemFingerprint", "Model");
            usageRecord = new TokenUsageRecord(
                SessionId: sessionId,
                TenantId: string.Empty,
                AgentName: agentName,
                ModelId: modelId,
                DeploymentName: modelId,
                PromptId: null,
                PromptVersion: null,
                PromptTokens: prompt,
                CompletionTokens: completion,
                TotalTokens: prompt + completion,
                EstimatedCostUsd: pricing.Estimate(modelId, prompt, completion),
                LatencyMs: sw.Elapsed.TotalMilliseconds,
                CapturedAt: DateTimeOffset.UtcNow,
                ModelVersion: modelVersion);

            if (await features.IsEnabledAsync(HealthQFeatures.TokenAccounting))
            {
                try
                {
                    await tokenLedger.RecordAsync(usageRecord, cancellationToken);
                }
                catch (Exception ex)
                {
                    logger.LogDebug(ex, "RedactingChatCompletionDecorator: token-ledger record failed for session {SessionId}", sessionId);
                }
            }
        }

        // W4.4 — emit hierarchical trace steps (llm_call + redaction) so the
        // frontend Agent Console (W5) can render every gateway hop without
        // the orchestrator having to thread sessionId through every callsite.
        if (traceRecorder is not null && !string.Equals(sessionId, "anonymous", StringComparison.Ordinal))
        {
            try
            {
                if (redactionEnabled && tokenMap is { Count: > 0 })
                {
                    await traceRecorder.RecordStepAsync(sessionId, new AgentTraceStep(
                        StepId: Guid.NewGuid().ToString("n"),
                        ParentStepId: null,
                        AgentName: agentName,
                        Kind: "redaction",
                        StartedAt: startedAt,
                        CompletedAt: startedAt,
                        Input: null,
                        Output: $"masked={tokenMap.Count} strategy={strategy ?? "none"}",
                        Citations: Array.Empty<RagCitation>(),
                        Tokens: null,
                        PromptId: null,
                        PromptVersion: null,
                        ModelId: null,
                        ModelVersion: null,
                        Verdict: null,
                        Confidence: null), cancellationToken);
                }

                await traceRecorder.RecordStepAsync(sessionId, new AgentTraceStep(
                    StepId: Guid.NewGuid().ToString("n"),
                    ParentStepId: null,
                    AgentName: agentName,
                    Kind: "llm_call",
                    StartedAt: startedAt,
                    CompletedAt: completedAt,
                    Input: null,
                    Output: null,
                    Citations: Array.Empty<RagCitation>(),
                    Tokens: usageRecord,
                    PromptId: usageRecord?.PromptId,
                    PromptVersion: usageRecord?.PromptVersion,
                    ModelId: usageRecord?.ModelId,
                    ModelVersion: usageRecord?.ModelVersion,
                    Verdict: null,
                    Confidence: null), cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "RedactingChatCompletionDecorator: trace-recorder step failed for session {SessionId}", sessionId);
            }
        }

        if (redactionEnabled && tokenMap is { Count: > 0 })
        {
            logger.LogDebug(
                "RedactingChatCompletionDecorator: completed for session {SessionId} via {Strategy} with {Count} masked entities.",
                sessionId, strategy ?? "none", tokenMap.Count);
        }

        return responses;
    }

    public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
        ChatHistory chatHistory,
        PromptExecutionSettings? executionSettings = null,
        Kernel? kernel = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var (sessionId, _) = ResolveContext(kernel);
        if (await features.IsEnabledAsync(HealthQFeatures.PhiRedaction))
        {
            var tokenMap = GetOrCreateSessionMap(sessionId);
            await RedactInPlaceAsync(chatHistory, sessionId, tokenMap, cancellationToken);
            // Note: streaming output is not rehydrated chunk-by-chunk because PHI
            // placeholders (e.g., <PHI:NAME_1>) can split across SSE chunks. The
            // model normally avoids echoing placeholders verbatim; orchestrators
            // that aggregate the stream can rehydrate against the session map
            // post-hoc via SessionMaps[sessionId].
        }

        await foreach (var chunk in inner.GetStreamingChatMessageContentsAsync(chatHistory, executionSettings, kernel, cancellationToken))
        {
            yield return chunk;
        }
    }

    /// <summary>Best-effort access to the per-session token map for stream consumers.</summary>
    public static IReadOnlyDictionary<string, string>? TryGetSessionMap(string sessionId)
        => SessionMaps.TryGetValue(sessionId, out var map) ? map : null;

    private static (string SessionId, string AgentName) ResolveContext(Kernel? kernel)
    {
        var session = kernel?.Data.TryGetValue("sessionId", out var s) == true ? s?.ToString() : null;
        var agent = kernel?.Data.TryGetValue("agentName", out var a) == true ? a?.ToString() : null;
        return (session ?? "anonymous", agent ?? "unknown");
    }

    private static Dictionary<string, string> GetOrCreateSessionMap(string sessionId)
        => SessionMaps.GetOrAdd(sessionId, _ => new Dictionary<string, string>(StringComparer.Ordinal));

    private async Task<string?> RedactInPlaceAsync(
        ChatHistory history,
        string sessionId,
        Dictionary<string, string> tokenMap,
        CancellationToken ct)
    {
        string? strategy = null;
        for (var i = 0; i < history.Count; i++)
        {
            var msg = history[i];
            var content = msg.Content;
            if (string.IsNullOrEmpty(content)) continue;

            // Skip already-fully-masked content: idempotency optimisation.
            if (!content.Contains("<PHI:", StringComparison.Ordinal) || HasUnknownTokens(content, tokenMap))
            {
                var r = await redactor.RedactAsync(content, sessionId, ct);
                strategy ??= r.Strategy;
                if (r.TokenMap.Count > 0)
                {
                    foreach (var kv in r.TokenMap) tokenMap[kv.Key] = kv.Value;
                    msg.Content = r.RedactedText;
                }
            }
        }
        return strategy;
    }

    private static bool HasUnknownTokens(string content, Dictionary<string, string> known)
    {
        // Cheap heuristic: if the content contains <PHI: substrings already present
        // in `known`, it's a no-op redact. Treated as fully-known when zero unknown
        // placeholders remain (we let the redactor decide the rest).
        foreach (var key in known.Keys)
        {
            if (!content.Contains(key, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    private static (int Prompt, int Completion) ExtractTokens(IReadOnlyDictionary<string, object?>? meta)
    {
        if (meta is null) return (0, 0);
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
        return (TryGetInt(meta, "PromptTokens"), TryGetInt(meta, "CompletionTokens"));
    }

    private static int TryGetInt(IReadOnlyDictionary<string, object?> meta, string key)
        => meta.TryGetValue(key, out var v) && v is not null
            && (v is int i ? (int?)i : (int.TryParse(v.ToString(), out var p) ? p : null)) is int n ? n : 0;

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
