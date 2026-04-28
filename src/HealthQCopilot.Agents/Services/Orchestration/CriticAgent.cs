using System.Text;
using System.Text.RegularExpressions;
using HealthQCopilot.Agents.Prompts;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Services.Orchestration;

/// <summary>
/// W2.3 — cross-agent validator.
///
/// Re-reads another agent's final answer against its source citations using a
/// strict LLM-as-judge prompt and decides whether the claim is supported. This
/// is independent from <see cref="HallucinationGuardAgent"/> (which scans for
/// forbidden patterns / HIPAA leaks): the critic checks <em>support</em>, not
/// <em>safety</em>. Both run in series before commit — guard first (cheap regex),
/// critic second (LLM call) — so the guard short-circuits the LLM cost when the
/// output is already clearly unsafe.
///
/// When no citations are supplied the critic returns <see cref="CriticVerdict.NotApplicable"/>
/// so callers can decide whether to escalate, fall back to RAG, or accept-with-flag.
/// </summary>
public interface ICriticAgent
{
    Task<CriticVerdict> ReviewAsync(
        string answer,
        IReadOnlyList<RagCitation> citations,
        CancellationToken ct = default);
}

public sealed record CriticVerdict(bool Supported, double Confidence, string? Reason)
{
    public static CriticVerdict NotApplicable { get; } = new(true, 0d, "no-citations");
}

public sealed class CriticAgent(
    IChatCompletionService chat,
    BusinessMetrics metrics,
    ILogger<CriticAgent> logger,
    IAgentPromptRegistry? prompts = null) : ICriticAgent
{
    private const string AgentName = "CriticAgent";

    private static readonly Regex SupportedRegex = new(
        @"\b(SUPPORTED|UNSUPPORTED)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex ScoreRegex = new(
        @"(?:score|confidence)\s*[:=]\s*(0?\.\d+|1(?:\.0+)?)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task<CriticVerdict> ReviewAsync(
        string answer,
        IReadOnlyList<RagCitation> citations,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(answer)) return new CriticVerdict(false, 0d, "empty-answer");
        if (citations is null || citations.Count == 0) return CriticVerdict.NotApplicable;

        var prompt = BuildPrompt(answer, citations);
        var history = new ChatHistory();
        // W4.5 — system message sourced from prompt registry; falls back to the
        // baseline string when the registry is unavailable (legacy ctor usage).
        var systemPrompt = prompts is not null && prompts.TryGet(InMemoryPromptRegistry.Ids.CriticReviewer, out var def)
            ? def.Template
            : "You are a strict clinical fact-checker. Compare the answer to the cited sources and decide whether every clinical claim in the answer is supported by at least one citation. Do not infer beyond the sources.";
        history.AddSystemMessage(systemPrompt);
        history.AddUserMessage(prompt);

        try
        {
            var settings = new OpenAIPromptExecutionSettings
            {
                Temperature = 0.0,
                MaxTokens = 96,
            };
            var response = await chat.GetChatMessageContentAsync(history, settings, kernel: null, ct);
            var text = response.Content ?? string.Empty;

            var supportedMatch = SupportedRegex.Match(text);
            var supported = supportedMatch.Success
                && supportedMatch.Value.Equals("SUPPORTED", StringComparison.OrdinalIgnoreCase);

            var scoreMatch = ScoreRegex.Match(text);
            var confidence = scoreMatch.Success && double.TryParse(scoreMatch.Groups[1].Value,
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var s)
                ? Math.Clamp(s, 0d, 1d)
                : (supported ? 0.85d : 0.15d);

            metrics.AgentGroundednessScore.Record(confidence,
                new KeyValuePair<string, object?>("agent", AgentName),
                new KeyValuePair<string, object?>("verdict", supported ? "supported" : "unsupported"));

            metrics.AgentGuardVerdictTotal.Add(1,
                new KeyValuePair<string, object?>("verdict", supported ? "safe" : "unsafe"),
                new KeyValuePair<string, object?>("agent", AgentName));

            if (!supported)
            {
                logger.LogWarning(
                    "CriticAgent rejected answer (conf={Confidence:F2}). Reason snippet: {Snippet}",
                    confidence, Truncate(text, 160));
            }

            return new CriticVerdict(supported, confidence, Truncate(text, 240));
        }
        catch (Exception ex)
        {
            // Critic failure must not block the request path. Treat as inconclusive
            // (Supported=true, low confidence) so HallucinationGuardAgent stays the
            // ultimate gate. Operators get a metric to alert on.
            logger.LogWarning(ex, "CriticAgent LLM call failed; passing through with low confidence.");
            metrics.AgentGuardVerdictTotal.Add(1,
                new KeyValuePair<string, object?>("verdict", "critic_error"),
                new KeyValuePair<string, object?>("agent", AgentName));
            return new CriticVerdict(true, 0.0d, $"critic-error:{ex.GetType().Name}");
        }
    }

    private static string BuildPrompt(string answer, IReadOnlyList<RagCitation> citations)
    {
        var sb = new StringBuilder();
        sb.AppendLine("ANSWER UNDER REVIEW:");
        sb.AppendLine(answer.Trim());
        sb.AppendLine();
        sb.AppendLine("CITATIONS:");
        for (var i = 0; i < citations.Count; i++)
        {
            var c = citations[i];
            sb.Append('[').Append(i + 1).Append("] ").Append(c.Title);
            if (!string.IsNullOrWhiteSpace(c.Snippet))
            {
                sb.Append(" — ").Append(c.Snippet!.Trim());
            }
            sb.AppendLine();
        }
        sb.AppendLine();
        sb.Append("Reply with exactly one line in the format: ");
        sb.AppendLine("VERDICT: <SUPPORTED|UNSUPPORTED>; SCORE: <0.0-1.0>; REASON: <one short sentence>.");
        return sb.ToString();
    }

    private static string Truncate(string s, int max)
        => string.IsNullOrEmpty(s) ? string.Empty : (s.Length <= max ? s : s[..max] + "…");
}
