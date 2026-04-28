using HealthQCopilot.Domain.Agents.Contracts;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// W4.1 — Cosmos DB-backed <see cref="ITokenLedger"/>. Persists every
/// <see cref="TokenUsageRecord"/> for cross-instance / cross-restart visibility
/// in cost dashboards and the agent trace API. Falls through to
/// <see cref="ILlmUsageTracker"/> for OTel/Application Insights metric
/// emission so existing dashboards keep working.
/// </summary>
public sealed class CosmosTokenLedger : ITokenLedger
{
    private readonly Container _container;
    private readonly ILlmUsageTracker _usageTracker;
    private readonly ILogger<CosmosTokenLedger> _logger;
    private readonly int _ttlSeconds;

    public CosmosTokenLedger(
        Container container,
        ILlmUsageTracker usageTracker,
        IOptions<CosmosOptions> options,
        ILogger<CosmosTokenLedger> logger)
    {
        _container = container;
        _usageTracker = usageTracker;
        _logger = logger;
        _ttlSeconds = options.Value.TokenLedgerTtlSeconds;
    }

    public async Task RecordAsync(TokenUsageRecord record, CancellationToken ct = default)
    {
        // Always emit metrics first — never let storage flakes silence telemetry.
        _usageTracker.TrackUsage(
            record.PromptTokens,
            record.CompletionTokens,
            record.AgentName,
            record.TenantId,
            record.LatencyMs,
            estimatedCostUsd: record.EstimatedCostUsd,
            modelId: record.ModelId);

        var doc = new TokenUsageDocument(
            id: Guid.NewGuid().ToString("N"),
            sessionId: record.SessionId,
            tenantId: record.TenantId,
            agentName: record.AgentName,
            modelId: record.ModelId,
            deploymentName: record.DeploymentName,
            promptId: record.PromptId,
            promptVersion: record.PromptVersion,
            promptTokens: record.PromptTokens,
            completionTokens: record.CompletionTokens,
            totalTokens: record.TotalTokens,
            estimatedCostUsd: record.EstimatedCostUsd,
            latencyMs: record.LatencyMs,
            capturedAt: record.CapturedAt,
            ttl: _ttlSeconds,
            modelVersion: record.ModelVersion);

        try
        {
            await _container.CreateItemAsync(doc, new PartitionKey(record.SessionId), cancellationToken: ct);
        }
        catch (Exception ex)
        {
            // Storage failure must never break the LLM request path.
            _logger.LogWarning(ex, "CosmosTokenLedger: failed to persist token record for session {SessionId}", record.SessionId);
        }
    }

    public async Task<IReadOnlyList<TokenUsageRecord>> GetSessionAsync(string sessionId, CancellationToken ct = default)
    {
        var results = new List<TokenUsageRecord>();
        try
        {
            var query = new QueryDefinition("SELECT * FROM c WHERE c.sessionId = @sid ORDER BY c.capturedAt ASC")
                .WithParameter("@sid", sessionId);
            using var iterator = _container.GetItemQueryIterator<TokenUsageDocument>(
                query,
                requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(sessionId) });

            while (iterator.HasMoreResults)
            {
                var page = await iterator.ReadNextAsync(ct);
                foreach (var doc in page) results.Add(doc.ToRecord());
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CosmosTokenLedger: failed to query session {SessionId}", sessionId);
        }
        return results;
    }

    /// <summary>
    /// Internal Cosmos document. Lower-cased property names map to the partition
    /// key path <c>/sessionId</c> and avoid System.Text.Json mismatch with
    /// existing data when serializer settings change.
    /// </summary>
    public sealed record TokenUsageDocument(
        string id,
        string sessionId,
        string tenantId,
        string agentName,
        string modelId,
        string deploymentName,
        string? promptId,
        string? promptVersion,
        int promptTokens,
        int completionTokens,
        int totalTokens,
        decimal estimatedCostUsd,
        double latencyMs,
        DateTimeOffset capturedAt,
        int ttl,
        string? modelVersion = null)
    {
        public TokenUsageRecord ToRecord() => new(
            sessionId, tenantId, agentName, modelId, deploymentName,
            promptId, promptVersion, promptTokens, completionTokens, totalTokens,
            estimatedCostUsd, latencyMs, capturedAt, modelVersion);
    }
}
