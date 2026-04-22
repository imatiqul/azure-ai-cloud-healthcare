using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.PopulationHealth;

/// <summary>
/// Immutable snapshot of a patient's risk assessment at a point in time.
///
/// Created automatically whenever a PatientRisk record is updated (via
/// RiskTrajectoryService) so the full time-series of risk score changes
/// is preserved for trending, forecasting, and audit purposes.
///
/// Retention: 7 years (HIPAA §164.530(j)).
/// </summary>
public class PatientRiskHistory : AggregateRoot<Guid>
{
    public string PatientId { get; private set; } = string.Empty;
    public RiskLevel Level { get; private set; }
    public double RiskScore { get; private set; }
    public string ModelVersion { get; private set; } = string.Empty;
    public DateTime AssessedAt { get; private set; }

    // ── Trajectory metadata ────────────────────────────────────────────────

    /// <summary>Change in RiskScore since the immediately prior snapshot (null for first entry).</summary>
    public double? ScoreDelta { get; private set; }

    /// <summary>Direction of change: Improving | Stable | Worsening.</summary>
    public RiskTrend Trend { get; private set; }

    /// <summary>Comma-separated dominant risk factors at the time of this snapshot.</summary>
    public string RiskFactorsSnapshot { get; private set; } = string.Empty;

    private PatientRiskHistory() { }

    public static PatientRiskHistory Create(
        string patientId,
        RiskLevel level,
        double riskScore,
        string modelVersion,
        IEnumerable<string> riskFactors,
        double? scoreDelta)
    {
        // Thresholds use the 0-1 normalised risk score scale.
        // A delta of ±0.05 (5 percentage-point move) triggers a directional trend.
        var trend = scoreDelta switch
        {
            null => RiskTrend.Stable,
            < -0.05 => RiskTrend.Improving,
            > 0.05 => RiskTrend.Worsening,
            _ => RiskTrend.Stable
        };

        return new PatientRiskHistory
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            Level = level,
            RiskScore = riskScore,
            ModelVersion = modelVersion,
            AssessedAt = DateTime.UtcNow,
            ScoreDelta = scoreDelta,
            Trend = trend,
            RiskFactorsSnapshot = string.Join(", ", riskFactors)
        };
    }
}

public enum RiskTrend { Improving, Stable, Worsening }
