using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Persists per-call <see cref="TokenUsageRecord"/> entries (App Insights custom
/// metrics + OpenTelemetry counters) and exposes session-level aggregates for
/// the agent trace API and cost dashboards.
/// </summary>
public interface ITokenLedger
{
    Task RecordAsync(TokenUsageRecord record, CancellationToken ct = default);

    Task<IReadOnlyList<TokenUsageRecord>> GetSessionAsync(string sessionId, CancellationToken ct = default);
}
