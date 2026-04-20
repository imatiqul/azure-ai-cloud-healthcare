namespace HealthQCopilot.Domain.Agents;

/// <summary>
/// Stores a single A/B experiment observation for statistical analysis.
///
/// One row is written per shadow-mode or explicit variant evaluation.
/// The <see cref="PromptExperimentService"/> aggregates these rows to compute
/// guard-pass rates, latency distributions, and z-test significance.
/// </summary>
public sealed class PromptExperimentOutcome
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string ExperimentId { get; init; } = string.Empty;
    public long ControlLatencyMs { get; init; }
    public long ChallengerLatencyMs { get; init; }
    public bool ControlGuardPassed { get; init; }
    public bool ChallengerGuardPassed { get; init; }
    public string ControlOutput { get; init; } = string.Empty;
    public string ChallengerOutput { get; init; } = string.Empty;
    public DateTime RecordedAt { get; init; } = DateTime.UtcNow;
}
