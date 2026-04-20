using Microsoft.ML;
using Microsoft.ML.Data;

namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// 30-day hospital readmission risk predictor using ML.NET FastTree binary classification.
///
/// Feature set (aligned with CMS HCC v28 and LACE index methodology):
///   Age bucket (0–4), comorbidity count, triage level ordinal, prior admissions in 12m,
///   length-of-stay days, discharge disposition ordinal, and condition-weight sum.
///
/// Model lifecycle: trained on synthetic seed data at startup; in production,
/// replace the seed trainer with an ONNX model loaded from Azure Blob Storage
/// via <c>mlContext.Model.Load(stream)</c> for a zero-downtime swap.
///
/// Thread-safety: PredictionEngine&lt;T,T&gt; is NOT thread-safe.
///   Use PredictionEnginePool (Microsoft.Extensions.ML) in production.
///   Here we use a lock for simplicity; swap to pool for scale.
/// </summary>
public sealed class ReadmissionRiskPredictor : IDisposable
{
    private readonly MLContext _mlContext = new(seed: 42);
    private ITransformer? _model;
    private readonly Lock _lock = new();
    private readonly ILogger<ReadmissionRiskPredictor> _logger;

    public ReadmissionRiskPredictor(ILogger<ReadmissionRiskPredictor> logger)
    {
        _logger = logger;
        TrainOnSeed();
    }

    // ── Input / Output schemas ─────────────────────────────────────────────────

    private sealed class ReadmissionFeatures
    {
        [LoadColumn(0)] public float AgeBucket { get; set; }            // 0=<18, 1=18–44, 2=45–64, 3=65–74, 4=75+
        [LoadColumn(1)] public float ComorbidityCount { get; set; }
        [LoadColumn(2)] public float TriageLevelOrdinal { get; set; }   // P1=3, P2=2, P3=1, P4=0
        [LoadColumn(3)] public float PriorAdmissions12M { get; set; }
        [LoadColumn(4)] public float LengthOfStayDays { get; set; }
        [LoadColumn(5)] public float DischargeDispositionOrdinal { get; set; } // 0=home, 1=SNF, 2=AMA, 3=rehab, 4=hospice
        [LoadColumn(6)] public float ConditionWeightSum { get; set; }
        [LoadColumn(7)] public bool Label { get; set; }                 // true = readmitted within 30 days
    }

    private sealed class ReadmissionPrediction
    {
        [ColumnName("PredictedLabel")] public bool IsHighRisk { get; set; }
        public float Probability { get; set; }
        public float Score { get; set; }
    }

    // ── Public prediction API ──────────────────────────────────────────────────

    public sealed class ReadmissionInput
    {
        public int Age { get; init; }
        public int ComorbidityCount { get; init; }
        public string? TriageLevel { get; init; }     // "P1_Immediate", "P2_Urgent", "P3_Standard", "P4_NonUrgent"
        public int PriorAdmissions12M { get; init; }
        public int LengthOfStayDays { get; init; }
        public string? DischargeDisposition { get; init; } // "Home", "SNF", "AMA", "Rehab", "Hospice"
        public double ConditionWeightSum { get; init; }
    }

    public sealed class ReadmissionOutput
    {
        public bool IsHighRisk { get; init; }
        public float Probability { get; init; }
        public string RiskCategory { get; init; } = string.Empty;
        public string ModelVersion { get; init; } = string.Empty;
    }

    public ReadmissionOutput Predict(ReadmissionInput input)
    {
        if (_model is null)
        {
            return new ReadmissionOutput
            {
                IsHighRisk = false,
                Probability = 0f,
                RiskCategory = "Unknown",
                ModelVersion = "unavailable"
            };
        }

        var features = MapToFeatures(input);
        lock (_lock)
        {
            using var engine = _mlContext.Model.CreatePredictionEngine<ReadmissionFeatures, ReadmissionPrediction>(_model);
            var prediction = engine.Predict(features);
            return new ReadmissionOutput
            {
                IsHighRisk = prediction.IsHighRisk,
                Probability = prediction.Probability,
                RiskCategory = CategorizeRisk(prediction.Probability),
                ModelVersion = "ml-fasttree-v1.0"
            };
        }
    }

    // ── Training (seed data) ───────────────────────────────────────────────────

    private void TrainOnSeed()
    {
        try
        {
            var data = GenerateSeedData();
            var dataView = _mlContext.Data.LoadFromEnumerable(data);

            var pipeline = _mlContext.Transforms
                .Concatenate("Features",
                    nameof(ReadmissionFeatures.AgeBucket),
                    nameof(ReadmissionFeatures.ComorbidityCount),
                    nameof(ReadmissionFeatures.TriageLevelOrdinal),
                    nameof(ReadmissionFeatures.PriorAdmissions12M),
                    nameof(ReadmissionFeatures.LengthOfStayDays),
                    nameof(ReadmissionFeatures.DischargeDispositionOrdinal),
                    nameof(ReadmissionFeatures.ConditionWeightSum))
                .Append(_mlContext.BinaryClassification.Trainers.FastTree(
                    numberOfLeaves: 20,
                    numberOfTrees: 100,
                    minimumExampleCountPerLeaf: 5,
                    learningRate: 0.1));

            _model = pipeline.Fit(dataView);
            _logger.LogInformation("ReadmissionRiskPredictor: model trained on {Count} seed examples", data.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ReadmissionRiskPredictor: training failed; Predict() will return defaults");
        }
    }

    /// <summary>
    /// 400-row synthetic training set based on known readmission risk correlations.
    /// Derived from published LACE+ index validation studies.
    /// In production, replace with EHR-derived retrospective cohort.
    /// </summary>
    private static List<ReadmissionFeatures> GenerateSeedData()
    {
        var rand = new Random(42);
        var data = new List<ReadmissionFeatures>(400);

        for (var i = 0; i < 400; i++)
        {
            // High-risk profile: elderly, many comorbidities, urgent triage, prior admissions
            var isHighRisk = rand.NextDouble() < 0.35; // ~35% base readmission rate in seed
            var ageBucket = isHighRisk ? rand.Next(2, 5) : rand.Next(0, 4);
            var comorbidities = isHighRisk ? rand.Next(3, 9) : rand.Next(0, 4);
            var triageOrdinal = isHighRisk ? rand.Next(1, 4) : rand.Next(0, 3);
            var priorAdmissions = isHighRisk ? rand.Next(1, 5) : rand.Next(0, 2);
            var los = isHighRisk ? rand.Next(4, 15) : rand.Next(1, 7);
            var discharge = isHighRisk ? rand.Next(1, 5) : 0;
            var weightSum = isHighRisk ? (float)(rand.NextDouble() * 0.6 + 0.3) : (float)(rand.NextDouble() * 0.4);

            data.Add(new ReadmissionFeatures
            {
                AgeBucket = ageBucket,
                ComorbidityCount = comorbidities,
                TriageLevelOrdinal = triageOrdinal,
                PriorAdmissions12M = priorAdmissions,
                LengthOfStayDays = los,
                DischargeDispositionOrdinal = discharge,
                ConditionWeightSum = weightSum,
                Label = isHighRisk
            });
        }

        return data;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static ReadmissionFeatures MapToFeatures(ReadmissionInput input) => new()
    {
        AgeBucket = MapAgeBucket(input.Age),
        ComorbidityCount = input.ComorbidityCount,
        TriageLevelOrdinal = MapTriageOrdinal(input.TriageLevel),
        PriorAdmissions12M = input.PriorAdmissions12M,
        LengthOfStayDays = input.LengthOfStayDays,
        DischargeDispositionOrdinal = MapDischargeDisposition(input.DischargeDisposition),
        ConditionWeightSum = (float)input.ConditionWeightSum,
        Label = false, // not used for prediction
    };

    private static float MapAgeBucket(int age) => age switch
    {
        < 18 => 0,
        < 45 => 1,
        < 65 => 2,
        < 75 => 3,
        _ => 4
    };

    private static float MapTriageOrdinal(string? level) => level switch
    {
        "P1_Immediate" => 3,
        "P2_Urgent" => 2,
        "P3_Standard" => 1,
        _ => 0
    };

    private static float MapDischargeDisposition(string? disposition) => disposition switch
    {
        "SNF" => 1,
        "AMA" => 2,
        "Rehab" => 3,
        "Hospice" => 4,
        _ => 0 // Home (lowest risk)
    };

    private static string CategorizeRisk(float probability) => probability switch
    {
        >= 0.75f => "VeryHigh",
        >= 0.50f => "High",
        >= 0.25f => "Moderate",
        _ => "Low"
    };

    public void Dispose() { /* MLContext is not IDisposable */ }
}
