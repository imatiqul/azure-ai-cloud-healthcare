using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Domain.Agents;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// A/B experiment infrastructure for prompt and model variant evaluation.
///
/// Supports:
///   - Deterministic variant assignment per session (hash-based, reproducible)
///   - Shadow-mode evaluation (run control + challenger in parallel, compare outputs)
///   - Metric collection per variant (latency, guard pass rate, user feedback signal)
///   - Experiment registry: each experiment linked to a <see cref="ModelRegistryEntry"/>
///
/// Usage:
///   1. Define an experiment with control + challenger prompts / config
///   2. Call <see cref="AssignVariantAsync"/> to get the variant for a session
///   3. Record outcome with <see cref="RecordOutcomeAsync"/>
///   4. Query <see cref="GetExperimentSummaryAsync"/> for statistical summary
///
/// Statistical note: this implementation uses a simple proportion z-test.
/// For production, integrate with Azure Experimentation or a Bayesian framework.
/// </summary>
public sealed class PromptExperimentService
{
    private readonly AgentDbContext _db;
    private readonly ILogger<PromptExperimentService> _logger;

    public PromptExperimentService(AgentDbContext db, ILogger<PromptExperimentService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Assigns a deterministic experiment variant to a session.
    ///
    /// The assignment is based on a stable hash of the sessionId so the same session
    /// always gets the same variant across the experiment lifetime.
    /// </summary>
    /// <param name="experimentId">Unique experiment identifier.</param>
    /// <param name="sessionId">The session being assigned (triage, guide, or coding session).</param>
    /// <param name="trafficSplit">Fraction assigned to the challenger (0.0–1.0, default 0.5).</param>
    public ExperimentVariant AssignVariant(string experimentId, string sessionId, double trafficSplit = 0.5)
    {
        // Deterministic hash: same session always gets same variant
        var hash = Math.Abs(HashCode.Combine(experimentId, sessionId));
        var bucket = (hash % 1000) / 1000.0;  // normalize to [0, 1)

        var variant = bucket < trafficSplit
            ? ExperimentVariant.Challenger
            : ExperimentVariant.Control;

        _logger.LogDebug(
            "ExperimentService: session {Session} → experiment {Experiment} → variant {Variant} (bucket={Bucket:F3})",
            sessionId, experimentId, variant, bucket);

        return variant;
    }

    /// <summary>
    /// Runs both control and challenger prompts in shadow mode, records both results,
    /// and returns the control result for production use.
    ///
    /// Shadow mode ensures the challenger never affects the patient-facing response
    /// while still collecting comparative metrics.
    /// </summary>
    public async Task<ShadowModeResult> RunShadowModeAsync(
        string experimentId,
        Func<CancellationToken, Task<ExperimentObservation>> controlFunc,
        Func<CancellationToken, Task<ExperimentObservation>> challengerFunc,
        CancellationToken ct = default)
    {
        // Run control (production path) first
        var controlObs = await controlFunc(ct);

        // Run challenger in background — do NOT await before returning control result
        // so production latency is unaffected
        _ = Task.Run(async () =>
        {
            try
            {
                var challengerObs = await challengerFunc(ct);
                var outcome = new PromptExperimentOutcome
                {
                    ExperimentId = experimentId,
                    ControlLatencyMs = controlObs.LatencyMs,
                    ChallengerLatencyMs = challengerObs.LatencyMs,
                    ControlGuardPassed = controlObs.GuardPassed,
                    ChallengerGuardPassed = challengerObs.GuardPassed,
                    ControlOutput = controlObs.Output[..Math.Min(500, controlObs.Output.Length)],
                    ChallengerOutput = challengerObs.Output[..Math.Min(500, challengerObs.Output.Length)],
                    RecordedAt = DateTime.UtcNow,
                };
                _db.PromptExperimentOutcomes.Add(outcome);
                await _db.SaveChangesAsync(CancellationToken.None);

                _logger.LogInformation(
                    "Shadow experiment {Id}: control={ControlMs}ms guard={ControlGuard}, challenger={ChalMs}ms guard={ChalGuard}",
                    experimentId, controlObs.LatencyMs, controlObs.GuardPassed,
                    challengerObs.LatencyMs, challengerObs.GuardPassed);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Shadow experiment {Id}: challenger evaluation failed", experimentId);
            }
        }, CancellationToken.None);

        return new ShadowModeResult(controlObs, ExperimentId: experimentId);
    }

    /// <summary>
    /// Records a single experiment outcome (for non-shadow mode experiments).
    /// </summary>
    public async Task RecordOutcomeAsync(
        string experimentId,
        ExperimentVariant variant,
        ExperimentObservation observation,
        CancellationToken ct = default)
    {
        var isChallenger = variant == ExperimentVariant.Challenger;
        var outcome = new PromptExperimentOutcome
        {
            ExperimentId = experimentId,
            ControlLatencyMs = isChallenger ? 0 : observation.LatencyMs,
            ChallengerLatencyMs = isChallenger ? observation.LatencyMs : 0,
            ControlGuardPassed = !isChallenger && observation.GuardPassed,
            ChallengerGuardPassed = isChallenger && observation.GuardPassed,
            ControlOutput = isChallenger ? string.Empty : observation.Output[..Math.Min(500, observation.Output.Length)],
            ChallengerOutput = isChallenger ? observation.Output[..Math.Min(500, observation.Output.Length)] : string.Empty,
            RecordedAt = DateTime.UtcNow,
        };
        _db.PromptExperimentOutcomes.Add(outcome);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Returns a statistical summary of an experiment comparing control vs. challenger.
    /// Uses a simple proportion z-test for the guard-pass-rate metric.
    /// </summary>
    public async Task<ExperimentSummary> GetExperimentSummaryAsync(
        string experimentId,
        CancellationToken ct = default)
    {
        var outcomes = await System.Threading.Tasks.Task.FromResult(
            _db.PromptExperimentOutcomes
                .Where(o => o.ExperimentId == experimentId)
                .ToList());

        if (outcomes.Count == 0)
            return new ExperimentSummary(experimentId, 0, 0, 0, 0, 0, 0, "no-data", false);

        var controlObs = outcomes.Where(o => o.ControlLatencyMs > 0).ToList();
        var challengerObs = outcomes.Where(o => o.ChallengerLatencyMs > 0).ToList();

        double controlGuardRate = controlObs.Count > 0 ? controlObs.Count(o => o.ControlGuardPassed) / (double)controlObs.Count : 0;
        double challengerGuardRate = challengerObs.Count > 0 ? challengerObs.Count(o => o.ChallengerGuardPassed) / (double)challengerObs.Count : 0;

        double controlAvgMs = controlObs.Count > 0 ? controlObs.Average(o => o.ControlLatencyMs) : 0;
        double challengerAvgMs = challengerObs.Count > 0 ? challengerObs.Average(o => o.ChallengerLatencyMs) : 0;

        // Simple z-test for proportions (guard pass rate)
        var zStat = ComputeZStat(controlGuardRate, controlObs.Count, challengerGuardRate, challengerObs.Count);
        var significant = Math.Abs(zStat) > 1.96; // p < 0.05 two-tailed
        var recommendation = significant
            ? (challengerGuardRate > controlGuardRate ? "promote-challenger" : "keep-control")
            : "insufficient-data";

        return new ExperimentSummary(
            ExperimentId: experimentId,
            ControlSampleSize: controlObs.Count,
            ChallengerSampleSize: challengerObs.Count,
            ControlGuardPassRate: Math.Round(controlGuardRate, 4),
            ChallengerGuardPassRate: Math.Round(challengerGuardRate, 4),
            ControlAvgLatencyMs: Math.Round(controlAvgMs, 1),
            ChallengerAvgLatencyMs: Math.Round(challengerAvgMs, 1),
            Recommendation: recommendation,
            StatisticallySignificant: significant);
    }

    private static double ComputeZStat(double p1, int n1, double p2, int n2)
    {
        if (n1 == 0 || n2 == 0) return 0;
        var pooled = (p1 * n1 + p2 * n2) / (n1 + n2);
        var se = Math.Sqrt(pooled * (1 - pooled) * (1.0 / n1 + 1.0 / n2));
        return se > 0 ? (p2 - p1) / se : 0;
    }
}

// ── Supporting types ───────────────────────────────────────────────────────────

public enum ExperimentVariant { Control, Challenger }

public sealed record ExperimentObservation(
    string Output,
    long LatencyMs,
    bool GuardPassed);

public sealed record ShadowModeResult(
    ExperimentObservation ControlResult,
    string ExperimentId);

public sealed record ExperimentSummary(
    string ExperimentId,
    int ControlSampleSize,
    int ChallengerSampleSize,
    double ControlGuardPassRate,
    double ChallengerGuardPassRate,
    double ControlAvgLatencyMs,
    double ChallengerAvgLatencyMs,
    string Recommendation,
    bool StatisticallySignificant);
