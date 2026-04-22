using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.PopulationHealth.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Risk Trajectory Service
///
/// Maintains an immutable time-series of patient risk scores in
/// <see cref="PatientRiskHistory"/> by snapshotting each risk assessment.
///
/// Supports:
///  - Appending a new history snapshot when a risk score is updated
///  - Querying the full risk trajectory for a patient (for charts / trend display)
///  - Computing trajectory statistics: min, max, mean, trend slope
/// </summary>
public sealed class RiskTrajectoryService(PopHealthDbContext db, ILogger<RiskTrajectoryService> logger)
{
    /// <summary>
    /// Called after a PatientRisk record is created or updated.
    /// Reads the most recent prior history entry to compute the score delta,
    /// then persists a new <see cref="PatientRiskHistory"/> snapshot.
    /// </summary>
    public async Task<PatientRiskHistory> RecordSnapshotAsync(
        PatientRisk risk,
        CancellationToken ct = default)
    {
        // Find most recent prior snapshot for this patient
        var lastSnapshot = await db.PatientRiskHistories
            .Where(h => h.PatientId == risk.PatientId)
            .OrderByDescending(h => h.AssessedAt)
            .FirstOrDefaultAsync(ct);

        double? delta = lastSnapshot is not null
            ? risk.RiskScore - lastSnapshot.RiskScore
            : null;

        var snapshot = PatientRiskHistory.Create(
            risk.PatientId,
            risk.Level,
            risk.RiskScore,
            risk.ModelVersion,
            risk.RiskFactors,
            delta);

        db.PatientRiskHistories.Add(snapshot);
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "RiskTrajectory snapshot recorded patient={PatientId} score={Score:F1} trend={Trend} delta={Delta}",
            risk.PatientId, risk.RiskScore, snapshot.Trend, delta?.ToString("F1") ?? "n/a");

        return snapshot;
    }

    /// <summary>
    /// Returns the full risk score trajectory for a patient, ordered chronologically.
    /// </summary>
    public async Task<RiskTrajectoryResult> GetTrajectoryAsync(
        string patientId,
        int maxPoints = 90,       // last 90 data points by default
        CancellationToken ct = default)
    {
        var history = await db.PatientRiskHistories
            .Where(h => h.PatientId == patientId)
            .OrderBy(h => h.AssessedAt)
            .Take(maxPoints)
            .ToListAsync(ct);

        if (history.Count == 0)
            return new RiskTrajectoryResult(patientId, [], null, null, null, 0, RiskTrend.Stable);

        var scores = history.Select(h => h.RiskScore).ToArray();

        double min = scores.Min();
        double max = scores.Max();
        double mean = scores.Average();

        // Linear regression slope (least squares) over time-indexed scores
        double slope = ComputeSlope(scores);
        // Thresholds calibrated for 0-1 normalised risk scores over 6-point history.
        // A per-step slope of ±0.001 (0.1% per snapshot) is sufficient to classify trend.
        var overallTrend = slope switch
        {
            < -0.001 => RiskTrend.Improving,
            > 0.001 => RiskTrend.Worsening,
            _ => RiskTrend.Stable
        };

        var dataPoints = history
            .Select(h => new RiskTrajectoryPoint(
                h.AssessedAt, h.RiskScore, h.Level.ToString(), h.Trend.ToString(),
                h.ScoreDelta, h.RiskFactorsSnapshot))
            .ToArray();

        return new RiskTrajectoryResult(patientId, dataPoints, min, max, mean, slope, overallTrend);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static double ComputeSlope(double[] values)
    {
        if (values.Length < 2) return 0;
        int n = values.Length;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++)
        {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumX2 += i * i;
        }
        double denom = n * sumX2 - sumX * sumX;
        return denom == 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    }
}

// ── Result DTOs ──────────────────────────────────────────────────────────────

public sealed record RiskTrajectoryResult(
    string PatientId,
    RiskTrajectoryPoint[] DataPoints,
    double? MinScore,
    double? MaxScore,
    double? MeanScore,
    double TrendSlope,    // > 0 = worsening, < 0 = improving
    RiskTrend OverallTrend);

public sealed record RiskTrajectoryPoint(
    DateTime AssessedAt,
    double RiskScore,
    string RiskLevel,
    string Trend,
    double? ScoreDelta,
    string RiskFactors);
