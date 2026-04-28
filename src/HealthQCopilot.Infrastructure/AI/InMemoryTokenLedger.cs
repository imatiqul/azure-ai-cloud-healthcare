using System.Collections.Concurrent;
using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// In-memory token ledger — emits OpenTelemetry / App Insights metrics via the
/// existing <see cref="ILlmUsageTracker"/> and retains a bounded session cache
/// so the agent trace API can return per-session aggregates without a round-trip
/// to App Insights. A future enhancement persists records to Cosmos DB.
/// </summary>
public sealed class InMemoryTokenLedger(ILlmUsageTracker usageTracker) : ITokenLedger
{
    private const int MaxSessions = 1024;
    private readonly ConcurrentDictionary<string, List<TokenUsageRecord>> _sessions = new(StringComparer.Ordinal);

    public Task RecordAsync(TokenUsageRecord record, CancellationToken ct = default)
    {
        usageTracker.TrackUsage(record.PromptTokens, record.CompletionTokens, record.AgentName, record.TenantId, record.LatencyMs);

        var list = _sessions.GetOrAdd(record.SessionId, _ => new List<TokenUsageRecord>());
        lock (list) { list.Add(record); }

        // Cheap LRU-ish eviction.
        if (_sessions.Count > MaxSessions)
        {
            foreach (var k in _sessions.Keys.Take(_sessions.Count - MaxSessions))
            {
                _sessions.TryRemove(k, out _);
            }
        }
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<TokenUsageRecord>> GetSessionAsync(string sessionId, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(sessionId, out var list))
        {
            lock (list) { return Task.FromResult<IReadOnlyList<TokenUsageRecord>>(list.ToArray()); }
        }
        return Task.FromResult<IReadOnlyList<TokenUsageRecord>>(Array.Empty<TokenUsageRecord>());
    }
}
