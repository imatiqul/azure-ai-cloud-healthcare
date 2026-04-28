using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Selects the next agent in a multi-agent planning session and constructs the
/// <see cref="AgentHandoffEnvelope"/> used to transfer state.
/// </summary>
public interface IAgentRouter
{
    Task<AgentRoutingDecision> RouteAsync(
        string currentAgent,
        string userIntent,
        double currentConfidence,
        IReadOnlyDictionary<string, string> sessionState,
        CancellationToken ct = default);
}

public sealed record AgentRoutingDecision(
    string NextAgent,
    string Reason,
    double Confidence,
    bool TerminateLoop);
