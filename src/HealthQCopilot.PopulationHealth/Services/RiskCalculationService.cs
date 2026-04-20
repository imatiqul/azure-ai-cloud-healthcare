using HealthQCopilot.Domain.PopulationHealth;

namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Hybrid risk scoring engine: blends deterministic rule-based scoring with
/// an ML.NET FastTree readmission risk model.
///
/// Final score = 0.55 × rules + 0.45 × ML  (weighted average)
/// If the ML model is unavailable, falls back to 100% rule-based (model-v1.0).
/// Version tag in PatientRisk.ModelVersion indicates which path was used.
///
/// Scoring method: weighted sum across clinical risk factors, capped to [0.0, 1.0].
/// Each condition category carries an evidence-based base weight drawn from
/// AHRQ readmission risk literature and CMS HCC v28 coefficients.
/// </summary>
public sealed class RiskCalculationService
{
    private const double RulesWeight = 0.55;
    private const double MlWeight = 0.45;

    private readonly ReadmissionRiskPredictor? _mlPredictor;
    private readonly ILogger<RiskCalculationService> _logger;

    public RiskCalculationService(
        ILogger<RiskCalculationService> logger,
        ReadmissionRiskPredictor? mlPredictor = null)
    {
        _logger = logger;
        _mlPredictor = mlPredictor;
    }

    // ── Condition-weight lookup (case-insensitive partial match) ─────────────
    private static readonly (string Keyword, double Weight)[] _conditionWeights =
    [
        ("diabetes",        0.18),
        ("a1c",             0.12),
        ("hba1c",           0.12),
        ("hypertension",    0.12),
        ("chf",             0.22),
        ("heart failure",   0.22),
        ("coronary",        0.20),
        ("copd",            0.18),
        ("chronic kidney",  0.20),
        ("ckd",             0.20),
        ("cancer",          0.22),
        ("oncology",        0.22),
        ("stroke",          0.20),
        ("afib",            0.15),
        ("atrial fibrill",  0.15),
        ("sepsis",          0.30),
        ("pneumonia",       0.15),
        ("depression",      0.10),
        ("mental health",   0.10),
        ("opioid",          0.14),
        ("substance",       0.14),
        ("obesity",         0.10),
        ("smoking",         0.10),
        ("pre-diabetes",    0.08),
        ("asthma",          0.10),
        ("liver",           0.16),
        ("cirrhosis",       0.22),
        ("hiv",             0.14),
        ("immunocompro",    0.16),
        ("dementia",        0.18),
        ("alzheimer",       0.18),
        ("frailty",         0.15),
        ("age>65",          0.12),
        ("age>75",          0.20),
        ("age>85",          0.26),
        ("polymed",         0.08),     // polypharmacy
        ("routine",        -0.05),
        ("wellness",       -0.03),
    ];

    // ── Triage-level adjustments ─────────────────────────────────────────────
    // When risk is re-assessed after a triage event, adjust the base score by level.
    private static readonly Dictionary<string, double> _triageLevelBoost = new(StringComparer.OrdinalIgnoreCase)
    {
        ["P1_Immediate"] = 0.30,
        ["P2_Urgent"] = 0.15,
        ["P3_Standard"] = 0.00,
        ["P4_NonUrgent"] = -0.05,
    };

    public PatientRisk Calculate(string patientId, IReadOnlyList<string> conditions, string? triageLevel = null,
        int age = 0, int priorAdmissions = 0, int los = 0, string? dischargeDisposition = null)
    {
        var rulesScore = ComputeBaseScore(conditions);

        if (triageLevel is not null && _triageLevelBoost.TryGetValue(triageLevel, out var boost))
            rulesScore += boost;

        rulesScore = Math.Clamp(rulesScore, 0.0, 1.0);

        // ── Blend with ML model ──────────────────────────────────────────────
        double score;
        string modelVersion;

        if (_mlPredictor is not null)
        {
            try
            {
                var conditionWeightSum = ComputeBaseScore(conditions); // reuse for ML feature
                var mlInput = new ReadmissionRiskPredictor.ReadmissionInput
                {
                    Age = age,
                    ComorbidityCount = conditions.Count,
                    TriageLevel = triageLevel,
                    PriorAdmissions12M = priorAdmissions,
                    LengthOfStayDays = los,
                    DischargeDisposition = dischargeDisposition,
                    ConditionWeightSum = conditionWeightSum,
                };
                var mlResult = _mlPredictor.Predict(mlInput);
                score = RulesWeight * rulesScore + MlWeight * mlResult.Probability;
                modelVersion = "hybrid-v1.0";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ML model prediction failed; falling back to rule-based scoring");
                score = rulesScore;
                modelVersion = "rule-v1.0-fallback";
            }
        }
        else
        {
            score = rulesScore;
            modelVersion = "rule-v1.0";
        }

        score = Math.Clamp(score, 0.0, 1.0);
        score = Math.Round(score, 4);

        var level = score switch
        {
            >= 0.75 => RiskLevel.Critical,
            >= 0.50 => RiskLevel.High,
            >= 0.25 => RiskLevel.Moderate,
            _ => RiskLevel.Low
        };

        return PatientRisk.Create(patientId, level, score, modelVersion, [.. conditions]);
    }

    /// <summary>
    /// Re-score an existing patient record with new conditions (for incremental updates).
    /// Returns a new PatientRisk record with a refreshed score.
    /// </summary>
    public PatientRisk Recalculate(string patientId, IReadOnlyList<string> existingFactors,
        IReadOnlyList<string> newFactors, string? triageLevel = null)
    {
        var combined = existingFactors.Union(newFactors, StringComparer.OrdinalIgnoreCase).ToList();
        return Calculate(patientId, combined, triageLevel);
    }

    private double ComputeBaseScore(IReadOnlyList<string> conditions)
    {
        if (conditions.Count == 0) return 0.05;

        var score = 0.05; // baseline
        foreach (var condition in conditions)
        {
            foreach (var (keyword, weight) in _conditionWeights)
            {
                if (condition.Contains(keyword, StringComparison.OrdinalIgnoreCase))
                {
                    score += weight;
                    break; // one match per condition
                }
            }
        }

        // Comorbidity multiplier: each additional condition beyond 2 adds 5%
        var comorbidityBonus = Math.Max(0, conditions.Count - 2) * 0.05;
        score += comorbidityBonus;

        return score;
    }
}
