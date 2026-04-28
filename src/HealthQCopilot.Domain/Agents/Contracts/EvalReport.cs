namespace HealthQCopilot.Domain.Agents.Contracts;

/// <summary>
/// Result of running the clinical evaluation harness against a golden case set.
/// </summary>
public sealed record EvalReport(
    string Suite,                      // triage | coding | care-gap | groundedness | toxicity
    string ModelId,
    string PromptId,
    string PromptVersion,
    DateTimeOffset RunAt,
    int TotalCases,
    int Passed,
    int Failed,
    double AccuracyScore,              // 0.0–1.0
    double GroundednessScore,          // 0.0–1.0 (LLM-as-judge)
    double ToxicityScore,              // 0.0–1.0 (lower is better)
    IReadOnlyList<EvalCaseResult> Cases);

public sealed record EvalCaseResult(
    string CaseId,
    string Category,
    bool Passed,
    string? Expected,
    string? Actual,
    double? Confidence,
    string? FailureReason,
    double? ToxicitySeverity = null);   // W3.3 — normalized 0.0–1.0 (max category severity)
