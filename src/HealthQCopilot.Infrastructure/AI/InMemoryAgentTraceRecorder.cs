using System.Collections.Concurrent;
using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// In-memory <see cref="IAgentTraceRecorder"/>. Sufficient for the read-only
/// <c>GET /api/v1/agents/traces/{sessionId}</c> endpoint backing the frontend
/// agent console while the persistent (Cosmos DB) implementation is built.
/// </summary>
public sealed class InMemoryAgentTraceRecorder : IAgentTraceRecorder
{
    private const int MaxSessions = 512;
    private readonly ConcurrentDictionary<string, AgentTraceState> _sessions = new(StringComparer.Ordinal);

    private sealed class AgentTraceState
    {
        public required string SessionId { get; init; }
        public required string TenantId { get; init; }
        public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? CompletedAt { get; set; }
        public string Status { get; set; } = "running";
        public List<AgentTraceStep> Steps { get; } = new();
    }

    public Task BeginSessionAsync(string sessionId, string tenantId, CancellationToken ct = default)
    {
        _sessions[sessionId] = new AgentTraceState { SessionId = sessionId, TenantId = tenantId };
        if (_sessions.Count > MaxSessions)
        {
            foreach (var k in _sessions.Keys.Take(_sessions.Count - MaxSessions))
            {
                _sessions.TryRemove(k, out _);
            }
        }
        return Task.CompletedTask;
    }

    public Task RecordStepAsync(string sessionId, AgentTraceStep step, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(sessionId, out var state))
        {
            lock (state.Steps) { state.Steps.Add(step); }
        }
        return Task.CompletedTask;
    }

    public Task CompleteSessionAsync(string sessionId, string status, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(sessionId, out var state))
        {
            state.CompletedAt = DateTimeOffset.UtcNow;
            state.Status = status;
        }
        return Task.CompletedTask;
    }

    public Task<AgentTraceDto?> GetAsync(string sessionId, CancellationToken ct = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var state)) return Task.FromResult<AgentTraceDto?>(null);

        AgentTraceStep[] steps;
        lock (state.Steps) { steps = state.Steps.ToArray(); }

        long pTokens = 0, cTokens = 0;
        decimal cost = 0m;
        int llm = 0, tools = 0;
        foreach (var s in steps)
        {
            if (s.Tokens is { } t)
            {
                pTokens += t.PromptTokens;
                cTokens += t.CompletionTokens;
                cost += t.EstimatedCostUsd;
            }
            if (s.Kind == "llm_call") llm++;
            else if (s.Kind == "tool_call") tools++;
        }
        var elapsed = (state.CompletedAt ?? DateTimeOffset.UtcNow) - state.StartedAt;

        var dto = new AgentTraceDto(
            state.SessionId,
            state.TenantId,
            state.StartedAt,
            state.CompletedAt,
            state.Status,
            steps,
            new AgentTraceTotals(llm, tools, pTokens, cTokens, cost, elapsed.TotalSeconds));

        return Task.FromResult<AgentTraceDto?>(dto);
    }
}
