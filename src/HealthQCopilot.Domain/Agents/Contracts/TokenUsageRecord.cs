namespace HealthQCopilot.Domain.Agents.Contracts;

/// <summary>
/// One LLM call's token consumption — captured by the token-ledger decorator
/// and aggregated into <c>agent_tokens_total</c> / <c>agent_llm_cost_usd_total</c>.
/// </summary>
public sealed record TokenUsageRecord(
    string SessionId,
    string TenantId,
    string AgentName,
    string ModelId,
    string DeploymentName,
    string? PromptId,
    string? PromptVersion,
    int PromptTokens,
    int CompletionTokens,
    int TotalTokens,
    decimal EstimatedCostUsd,
    double LatencyMs,
    DateTimeOffset CapturedAt,
    string? ModelVersion = null);
