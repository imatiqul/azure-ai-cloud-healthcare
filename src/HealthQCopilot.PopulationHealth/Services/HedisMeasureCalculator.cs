namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Evaluates NCQA HEDIS quality measure compliance for individual patients.
///
/// Each measure returns <see cref="HedisMeasureResult"/> indicating:
///   - Whether the patient is in the denominator (eligible population)
///   - Whether the patient meets the numerator (compliant)
///   - The measure description and guidance for closing the care gap
///
/// Data sources: patient conditions, procedures, observations, and demographics
/// are passed as structured inputs rather than read from the database here,
/// keeping the calculator pure and independently testable.
/// </summary>
public sealed class HedisMeasureCalculator
{
    // ── Result type ────────────────────────────────────────────────────────────

    public sealed record HedisMeasureResult(
        string MeasureId,
        string MeasureName,
        bool InDenominator,
        bool InNumerator,
        bool HasCareGap,
        string? GapDescription,
        string? RecommendedAction);

    // ── Patient input ──────────────────────────────────────────────────────────

    public sealed class PatientMeasureInput
    {
        public required string PatientId { get; init; }
        public required int Age { get; init; }
        public required string Sex { get; init; }       // "M" or "F"
        public required IReadOnlyList<string> Conditions { get; init; }   // ICD-10 or free-text
        public required IReadOnlyList<string> Procedures { get; init; }   // CPT codes
        public required IReadOnlyList<string> Observations { get; init; } // LOINC codes with values
        public required DateTime? LastHbA1cDate { get; init; }
        public required double? LastHbA1cValue { get; init; }
        public required DateTime? LastBpDate { get; init; }
        public required int? LastSystolicBp { get; init; }
        public required int? LastDiastolicBp { get; init; }
        public required DateTime? LastMammogramDate { get; init; }
        public required DateTime? LastColorectalScreenDate { get; init; }
        public required string? ColorectalScreenType { get; init; } // "colonoscopy", "fobt", "fitdna", "sigmoidoscopy", "ctc"
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /// <summary>Evaluate all HEDIS measures for the patient and return one result per applicable measure.</summary>
    public IReadOnlyList<HedisMeasureResult> EvaluateAll(PatientMeasureInput input)
    {
        var results = new List<HedisMeasureResult>
        {
            EvaluateDiabetesHbA1c(input),
            EvaluateBloodPressureControl(input),
            EvaluateBreastCancerScreening(input),
            EvaluateColorectalCancerScreening(input),
        };
        return results;
    }

    // ── Individual measures ────────────────────────────────────────────────────

    /// <summary>
    /// CDC-HbA1c: Comprehensive Diabetes Care — HbA1c Control (&lt;8.0%).
    /// Denominator: members aged 18–75 with type 1 or type 2 diabetes.
    /// Numerator: HbA1c &lt; 8.0% in measurement year.
    /// </summary>
    public HedisMeasureResult EvaluateDiabetesHbA1c(PatientMeasureInput input)
    {
        const string id = "CDC-HbA1c";
        const string name = "Comprehensive Diabetes Care — HbA1c Control";

        var hasDiabetes = input.Conditions.Any(c =>
            c.StartsWith("E10", StringComparison.OrdinalIgnoreCase) ||  // Type 1
            c.StartsWith("E11", StringComparison.OrdinalIgnoreCase) ||  // Type 2
            c.Contains("diabetes", StringComparison.OrdinalIgnoreCase));

        var inDenominator = hasDiabetes && input.Age is >= 18 and <= 75;
        if (!inDenominator)
            return new(id, name, false, false, false, null, null);

        var measurementYear = DateTime.UtcNow.Year;
        var recentHbA1c = input.LastHbA1cDate?.Year == measurementYear && input.LastHbA1cValue.HasValue;
        var controlled  = recentHbA1c && input.LastHbA1cValue!.Value < 8.0;

        return new(
            id, name,
            InDenominator : true,
            InNumerator   : controlled,
            HasCareGap    : !controlled,
            GapDescription: controlled
                ? null
                : recentHbA1c
                    ? $"HbA1c is {input.LastHbA1cValue:F1}% — above 8.0% target"
                    : "No HbA1c result recorded in the current measurement year",
            RecommendedAction: controlled
                ? null
                : "Order HbA1c test or intensify glycemic management. Consider endocrinology referral if HbA1c ≥ 9.0%.");
    }

    /// <summary>
    /// CBP: Controlling High Blood Pressure.
    /// Denominator: members aged 18–85 with essential hypertension (I10).
    /// Numerator: most recent BP &lt; 140/90 mmHg.
    /// </summary>
    public HedisMeasureResult EvaluateBloodPressureControl(PatientMeasureInput input)
    {
        const string id = "CBP";
        const string name = "Controlling High Blood Pressure";

        var hasHtn = input.Conditions.Any(c =>
            c.StartsWith("I10", StringComparison.OrdinalIgnoreCase) ||
            c.Contains("hypertension", StringComparison.OrdinalIgnoreCase));

        var inDenominator = hasHtn && input.Age is >= 18 and <= 85;
        if (!inDenominator)
            return new(id, name, false, false, false, null, null);

        var controlled = input.LastSystolicBp.HasValue &&
                         input.LastDiastolicBp.HasValue &&
                         input.LastSystolicBp.Value < 140 &&
                         input.LastDiastolicBp.Value < 90;

        return new(
            id, name,
            InDenominator : true,
            InNumerator   : controlled,
            HasCareGap    : !controlled,
            GapDescription: controlled
                ? null
                : input.LastSystolicBp.HasValue
                    ? $"BP is {input.LastSystolicBp}/{input.LastDiastolicBp} mmHg — target is <140/90"
                    : "No blood pressure reading on record",
            RecommendedAction: controlled
                ? null
                : "Schedule BP check; consider medication adjustment or lifestyle counselling.");
    }

    /// <summary>
    /// BCS: Breast Cancer Screening.
    /// Denominator: women aged 50–74.
    /// Numerator: ≥ 1 mammogram in prior 2 years.
    /// </summary>
    public HedisMeasureResult EvaluateBreastCancerScreening(PatientMeasureInput input)
    {
        const string id = "BCS";
        const string name = "Breast Cancer Screening";

        var inDenominator = input.Sex.Equals("F", StringComparison.OrdinalIgnoreCase) &&
                            input.Age is >= 50 and <= 74;
        if (!inDenominator)
            return new(id, name, false, false, false, null, null);

        var twoYearsAgo  = DateTime.UtcNow.AddYears(-2);
        var hadMammogram = input.LastMammogramDate.HasValue &&
                           input.LastMammogramDate.Value >= twoYearsAgo;

        return new(
            id, name,
            InDenominator : true,
            InNumerator   : hadMammogram,
            HasCareGap    : !hadMammogram,
            GapDescription: hadMammogram ? null : "No mammogram recorded in the past 2 years",
            RecommendedAction: hadMammogram
                ? null
                : "Order screening mammogram and document result in the EHR.");
    }

    /// <summary>
    /// COL: Colorectal Cancer Screening.
    /// Denominator: members aged 45–75.
    /// Numerator: appropriate screening based on test type interval.
    /// </summary>
    public HedisMeasureResult EvaluateColorectalCancerScreening(PatientMeasureInput input)
    {
        const string id = "COL";
        const string name = "Colorectal Cancer Screening";

        var inDenominator = input.Age is >= 45 and <= 75;
        if (!inDenominator)
            return new(id, name, false, false, false, null, null);

        var compliant = false;
        if (input.LastColorectalScreenDate.HasValue && !string.IsNullOrEmpty(input.ColorectalScreenType))
        {
            var lastScreen = input.LastColorectalScreenDate.Value;
            compliant = input.ColorectalScreenType.ToLowerInvariant() switch
            {
                "fobt"          => lastScreen >= DateTime.UtcNow.AddYears(-1),
                "fitdna"        => lastScreen >= DateTime.UtcNow.AddYears(-3),
                "sigmoidoscopy" => lastScreen >= DateTime.UtcNow.AddYears(-5),
                "ctc"           => lastScreen >= DateTime.UtcNow.AddYears(-5),
                "colonoscopy"   => lastScreen >= DateTime.UtcNow.AddYears(-10),
                _               => false
            };
        }

        return new(
            id, name,
            InDenominator : true,
            InNumerator   : compliant,
            HasCareGap    : !compliant,
            GapDescription: compliant ? null : "Patient is overdue for colorectal cancer screening",
            RecommendedAction: compliant
                ? null
                : "Offer FOBT/FIT (annual), FIT-DNA (1–3 years), colonoscopy (10 years), " +
                  "flexible sigmoidoscopy or CT colonography (5 years).");
    }
}
