using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Default <see cref="IAgentRouter"/>: a confidence-driven router that prefers
/// to terminate when current confidence is high and otherwise hands off to a
/// fixed escalation chain. Replaced by an LLM-driven router when
/// <c>HealthQ:AgentHandoff</c> moves out of canary.
/// </summary>
public sealed class ConfidenceBasedAgentRouter : IAgentRouter
{
    private const double TerminateThreshold = 0.85;
    private static readonly Dictionary<string, string> s_chain = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Triage"] = "ClinicalCoder",
        ["ClinicalCoder"] = "PriorAuth",
        ["PriorAuth"] = "Scheduling",
        ["CareGap"] = "Scheduling"
    };

    public Task<AgentRoutingDecision> RouteAsync(
        string currentAgent,
        string userIntent,
        double currentConfidence,
        IReadOnlyDictionary<string, string> sessionState,
        CancellationToken ct = default)
    {
        if (currentConfidence >= TerminateThreshold)
        {
            return Task.FromResult(new AgentRoutingDecision(currentAgent, "confidence-threshold-met", currentConfidence, true));
        }

        var next = s_chain.TryGetValue(currentAgent, out var n) ? n : currentAgent;
        var terminate = string.Equals(next, currentAgent, StringComparison.OrdinalIgnoreCase);
        return Task.FromResult(new AgentRoutingDecision(next, "fallback-chain", currentConfidence, terminate));
    }
}
