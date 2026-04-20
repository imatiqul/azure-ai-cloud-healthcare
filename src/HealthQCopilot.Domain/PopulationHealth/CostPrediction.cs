using System.Text.Json;
using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.PopulationHealth;

/// <summary>
/// Persisted 12-month total-cost-of-care prediction for a patient.
///
/// Predicted cost is denominated in USD.  The 95% confidence interval is
/// a parametric bootstrap approximation (±30%) derived from actuarial
/// variance observed in AHRQ MEPS data for comparable risk tiers.
/// </summary>
public class CostPrediction : AggregateRoot<Guid>
{
    public string PatientId { get; private set; } = string.Empty;

    /// <summary>Point estimate — predicted total cost over the next 12 months (USD).</summary>
    public decimal Predicted12mCost { get; private set; }

    /// <summary>Lower bound of the 95% prediction interval (USD).</summary>
    public decimal LowerBound95 { get; private set; }

    /// <summary>Upper bound of the 95% prediction interval (USD).</summary>
    public decimal UpperBound95 { get; private set; }

    /// <summary>"Low" | "Moderate" | "High" | "VeryHigh"</summary>
    public string CostTier { get; private set; } = string.Empty;

    /// <summary>JSON array of narrative cost-driver strings.</summary>
    public string CostDriversJson { get; private set; } = "[]";

    public string ModelVersion { get; private set; } = string.Empty;
    public DateTime PredictedAt { get; private set; }

    // Computed property ───────────────────────────────────────────────────────
    public IReadOnlyList<string> CostDrivers =>
        JsonSerializer.Deserialize<List<string>>(CostDriversJson) ?? [];

    private CostPrediction() { }

    public static CostPrediction Create(
        string patientId,
        decimal predicted,
        decimal lower95,
        decimal upper95,
        string tier,
        string[] drivers,
        string modelVersion)
    {
        return new CostPrediction
        {
            Id               = Guid.NewGuid(),
            PatientId        = patientId,
            Predicted12mCost = predicted,
            LowerBound95     = lower95,
            UpperBound95     = upper95,
            CostTier         = tier,
            CostDriversJson  = JsonSerializer.Serialize(drivers),
            ModelVersion     = modelVersion,
            PredictedAt      = DateTime.UtcNow,
        };
    }
}
