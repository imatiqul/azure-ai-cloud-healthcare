using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Records and exposes hierarchical agent traces for a session (steps, tool
/// calls, RAG hits, redactions, tokens). Backs <c>GET /api/v1/agents/traces/{id}</c>.
/// </summary>
public interface IAgentTraceRecorder
{
    Task BeginSessionAsync(string sessionId, string tenantId, CancellationToken ct = default);

    Task RecordStepAsync(string sessionId, AgentTraceStep step, CancellationToken ct = default);

    Task CompleteSessionAsync(string sessionId, string status, CancellationToken ct = default);

    Task<AgentTraceDto?> GetAsync(string sessionId, CancellationToken ct = default);
}
