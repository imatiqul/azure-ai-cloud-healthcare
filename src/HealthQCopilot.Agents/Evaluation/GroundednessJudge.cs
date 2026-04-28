using System.Globalization;
using System.Text.RegularExpressions;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Evaluation;

/// <summary>
/// W3.2 — LLM-as-judge groundedness scorer. Asks a model to rate, on a 0.0–1.0
/// scale, whether <paramref name="answer"/> is fully supported by the provided
/// <paramref name="context"/> (RAG-retrieved snippets). Emits the result via
/// <see cref="BusinessMetrics.AgentGroundednessScore"/> for dashboarding.
/// </summary>
public interface IGroundednessJudge
{
    Task<double> JudgeAsync(string answer, IReadOnlyList<string> context, CancellationToken ct = default);
}

public sealed partial class LlmGroundednessJudge(
    IChatCompletionService chat,
    BusinessMetrics metrics,
    ILogger<LlmGroundednessJudge> logger) : IGroundednessJudge
{
    private static readonly OpenAIPromptExecutionSettings Settings = new()
    {
        MaxTokens = 16,
        Temperature = 0.0,
    };

    public async Task<double> JudgeAsync(string answer, IReadOnlyList<string> context, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(answer) || context.Count == 0) return 0d;

        var contextBlock = string.Join("\n---\n", context);
        var history = new ChatHistory();
        history.AddSystemMessage(
            "You are a clinical groundedness judge. Score on a strict 0.0 to 1.0 scale how well the ANSWER is supported by the CONTEXT. "
            + "1.0 = every claim is directly supported. 0.0 = answer contradicts or invents facts. "
            + "Respond with ONLY a decimal number, no prose.");
        history.AddUserMessage($"CONTEXT:\n{contextBlock}\n\nANSWER:\n{answer}\n\nSCORE:");

        try
        {
            var response = await chat.GetChatMessageContentAsync(history, Settings, kernel: null, ct);
            var raw = (response.Content ?? "0").Trim();
            var match = NumberRegex().Match(raw);
            if (!match.Success) return 0d;
            if (!double.TryParse(match.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var score))
                return 0d;
            score = Math.Clamp(score, 0d, 1d);
            metrics.AgentGroundednessScore.Record(score);
            return score;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "LlmGroundednessJudge: judge call failed");
            return 0d;
        }
    }

    [GeneratedRegex(@"\d+(?:\.\d+)?", RegexOptions.Compiled)]
    private static partial Regex NumberRegex();
}
