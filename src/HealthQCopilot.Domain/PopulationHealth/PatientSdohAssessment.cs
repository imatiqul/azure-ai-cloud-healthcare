using System.Text.Json;
using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.PopulationHealth;

/// <summary>
/// Persisted record of a Social Determinants of Health (SDOH) screening assessment.
///
/// Domain scores stored as JSON columns so the set of assessed domains can be
/// extended without a schema migration.  Use the computed properties to deserialise.
/// </summary>
public class PatientSdohAssessment : AggregateRoot<Guid>
{
    public string PatientId { get; private set; } = string.Empty;

    /// <summary>Sum of all domain scores; range 0–24 (8 domains × 0–3).</summary>
    public int TotalScore { get; private set; }

    /// <summary>"Low" | "Moderate" | "High"</summary>
    public string RiskLevel { get; private set; } = string.Empty;

    /// <summary>[0.0, 0.30] — additive weight blended into clinical risk score.</summary>
    public double CompositeRiskWeight { get; private set; }

    // Serialised JSON columns ─────────────────────────────────────────────────
    public string DomainScoresJson          { get; private set; } = "{}";
    public string PrioritizedNeedsJson      { get; private set; } = "[]";
    public string RecommendedActionsJson    { get; private set; } = "[]";

    public string? AssessedBy { get; private set; }
    public string? Notes      { get; private set; }
    public DateTime AssessedAt { get; private set; }

    // Computed deserialised properties (not persisted) ────────────────────────
    public IReadOnlyDictionary<string, int> DomainScores =>
        JsonSerializer.Deserialize<Dictionary<string, int>>(DomainScoresJson) ?? new();

    public IReadOnlyList<string> PrioritizedNeeds =>
        JsonSerializer.Deserialize<List<string>>(PrioritizedNeedsJson) ?? [];

    public IReadOnlyList<string> RecommendedActions =>
        JsonSerializer.Deserialize<List<string>>(RecommendedActionsJson) ?? [];

    private PatientSdohAssessment() { }

    public static PatientSdohAssessment Create(
        string patientId,
        int totalScore,
        string riskLevel,
        double compositeRiskWeight,
        Dictionary<string, int> domainScores,
        List<string> prioritizedNeeds,
        List<string> recommendedActions,
        string? assessedBy = null,
        string? notes = null)
    {
        return new PatientSdohAssessment
        {
            Id                     = Guid.NewGuid(),
            PatientId              = patientId,
            TotalScore             = totalScore,
            RiskLevel              = riskLevel,
            CompositeRiskWeight    = compositeRiskWeight,
            DomainScoresJson       = JsonSerializer.Serialize(domainScores),
            PrioritizedNeedsJson   = JsonSerializer.Serialize(prioritizedNeeds),
            RecommendedActionsJson = JsonSerializer.Serialize(recommendedActions),
            AssessedBy             = assessedBy,
            Notes                  = notes,
            AssessedAt             = DateTime.UtcNow,
        };
    }
}
