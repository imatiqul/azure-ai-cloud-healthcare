using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Agents;

/// <summary>
/// Stores the result of a prompt regression evaluation run.
/// Each run exercises a fixed golden-set of clinical prompts through
/// the live Semantic Kernel pipeline and scores the outputs.
///
/// Evaluation criteria per test case:
///   - Urgency level present and valid (P1–P4)
///   - ICD-10 codes syntactically valid
///   - No hallucinated clinical data (guard check)
///   - Response latency within SLA (≤ 3 seconds)
/// </summary>
public sealed class PromptEvaluationRun : AggregateRoot<Guid>
{
    public Guid ModelRegistryEntryId { get; private set; }
    public int TotalCases { get; private set; }
    public int PassedCases { get; private set; }
    public double Score { get; private set; }               // PassedCases / TotalCases
    public string ResultsJson { get; private set; } = "[]"; // JSON array of per-case results
    public DateTime EvaluatedAt { get; private set; }
    public string EvaluatedByUserId { get; private set; } = string.Empty;
    public bool PassedThreshold { get; private set; }       // Score >= 0.80 (configurable)

    private PromptEvaluationRun() { }

    public static PromptEvaluationRun Create(
        Guid modelRegistryEntryId,
        int totalCases,
        int passedCases,
        string resultsJson,
        string evaluatedByUserId,
        double threshold = 0.80)
    {
        var score = totalCases > 0 ? (double)passedCases / totalCases : 0.0;
        return new PromptEvaluationRun
        {
            Id = Guid.NewGuid(),
            ModelRegistryEntryId = modelRegistryEntryId,
            TotalCases = totalCases,
            PassedCases = passedCases,
            Score = Math.Round(score, 4),
            ResultsJson = resultsJson,
            EvaluatedAt = DateTime.UtcNow,
            EvaluatedByUserId = evaluatedByUserId,
            PassedThreshold = score >= threshold,
        };
    }
}
