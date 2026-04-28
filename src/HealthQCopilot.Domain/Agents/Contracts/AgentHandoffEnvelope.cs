namespace HealthQCopilot.Domain.Agents.Contracts;

/// <summary>
/// State envelope passed when one agent hands control to another within a
/// planning session. Carries shared session state, accumulated citations and the
/// remaining budget so the receiving agent can decide whether to proceed.
/// </summary>
public sealed record AgentHandoffEnvelope(
    string SessionId,
    string TenantId,
    string FromAgent,
    string ToAgent,
    string Reason,
    string Goal,
    IReadOnlyDictionary<string, string> SharedState,
    IReadOnlyList<RagCitation> AccumulatedCitations,
    AgentBudgetSnapshot RemainingBudget,
    DateTimeOffset HandoffAt);

public sealed record AgentBudgetSnapshot(
    int RemainingIterations,
    long RemainingTokens,
    double RemainingWallClockSeconds);
