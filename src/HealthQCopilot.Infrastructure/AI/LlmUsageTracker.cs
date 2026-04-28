using System.Diagnostics;
using HealthQCopilot.Infrastructure.Metrics;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Emits Azure OpenAI token usage as OpenTelemetry counters via <see cref="BusinessMetrics"/>.
///
/// Metric naming follows OpenTelemetry semantic conventions for LLM observability (OTel GenAI SIG):
///   - healthq.llm.prompt_tokens.total      [counter] tagged by agent + tenant
///   - healthq.llm.completion_tokens.total   [counter] tagged by agent + tenant
///   - healthq.llm.call.latency.ms           [histogram] tagged by agent + tenant
///
/// These drive:
///   - Grafana dashboards: cost-per-tenant, token rate, prompt-to-completion ratio
///   - Azure Monitor workbooks: LLM spend by service, time-of-day patterns
///   - Alerting: cost anomaly alerts when token rate exceeds expected baseline
/// </summary>
public sealed class LlmUsageTracker(BusinessMetrics metrics) : ILlmUsageTracker
{
    public void TrackUsage(
        int promptTokens,
        int completionTokens,
        string agentName,
        string tenantId,
        double latencyMs,
        decimal estimatedCostUsd = 0m,
        string? modelId = null)
    {
        var tags = new TagList
        {
            { "agent", agentName },
            { "tenant", tenantId }
        };

        if (promptTokens > 0)
            metrics.LlmPromptTokensTotal.Add(promptTokens, tags);

        if (completionTokens > 0)
            metrics.LlmCompletionTokensTotal.Add(completionTokens, tags);

        if (latencyMs > 0)
            metrics.LlmCallLatencyMs.Record(latencyMs, tags);

        // W4.2 — cost-per-call USD counter feeds the agent-cost Grafana dashboard
        // and Azure Cost Management tag-based billing analysis. Tag by model so a
        // model-mix change (e.g. swapping gpt-4o-mini for gpt-4o on the triage path)
        // shows up cleanly on the panel without losing per-tenant attribution.
        if (estimatedCostUsd > 0m)
        {
            var costTags = new TagList
            {
                { "agent", agentName },
                { "tenant", tenantId },
                { "model", modelId ?? "unknown" },
            };
            metrics.AgentLlmCostUsdTotal.Add((double)estimatedCostUsd, costTags);
        }
    }
}
