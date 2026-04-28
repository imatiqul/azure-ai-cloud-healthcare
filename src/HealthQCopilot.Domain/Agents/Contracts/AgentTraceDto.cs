namespace HealthQCopilot.Domain.Agents.Contracts;

/// <summary>
/// Hierarchical trace of a single agent planning session, surfaced to the
/// frontend Agent Console via <c>GET /api/v1/agents/traces/{sessionId}</c>.
/// </summary>
public sealed record AgentTraceDto(
    string SessionId,
    string TenantId,
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt,
    string Status,                 // running | completed | cancelled | error | budget_exhausted
    IReadOnlyList<AgentTraceStep> Steps,
    AgentTraceTotals Totals);

public sealed record AgentTraceStep(
    string StepId,
    string? ParentStepId,
    string AgentName,
    string Kind,                   // plan | tool_call | rag_lookup | llm_call | guard | handoff | redaction
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt,
    string? Input,
    string? Output,
    IReadOnlyList<RagCitation> Citations,
    TokenUsageRecord? Tokens,
    string? PromptId,
    string? PromptVersion,
    string? ModelId,
    string? ModelVersion,
    string? Verdict,               // for guard steps: ok | hallucination | hipaa_violation | low_confidence
    double? Confidence);

public sealed record RagCitation(
    string SourceId,
    string Title,
    string? Url,
    double Score,
    string? Snippet);

public sealed record AgentTraceTotals(
    int LlmCalls,
    int ToolCalls,
    long PromptTokens,
    long CompletionTokens,
    decimal EstimatedCostUsd,
    double WallClockSeconds);
