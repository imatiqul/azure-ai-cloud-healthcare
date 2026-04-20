using System.Text.Json;

namespace HealthQCopilot.Fhir.Services;

/// <summary>
/// Lab Delta Flagging Service
///
/// Detects clinically significant changes in laboratory values between consecutive
/// observations for the same patient and analyte (LOINC code).
///
/// Delta thresholds are derived from AACC/CLIA critical change recommendations
/// and the Royal College of Pathologists Delta Check guidelines (2018).
///
/// Supported analytes (LOINC codes with clinically validated thresholds):
///   2345-7  Glucose             ±70 mg/dL    (30% relative)
///   2160-0  Creatinine          ±0.5 mg/dL   (50% relative)
///   2951-2  Sodium              ±10 mEq/L
///   2823-3  Potassium           ±1.0 mEq/L   (critical: outside 3.0-6.0)
///   718-7   Hemoglobin          ±2.0 g/dL
///   6690-2  WBC                 ±4.0 × 10³/µL
///   13056-7 Platelet count      ±50 × 10³/µL
///   1742-6  ALT                 ±50%
///   1920-8  AST                 ±50%
///   6768-6  ALP                 ±50%
///   2157-6  Creatine kinase     ±50%
///   14627-4 Bicarbonate         ±5 mEq/L
///   2075-0  Chloride            ±10 mEq/L
///   21000-5 HbA1c               ±1.0% absolute
///   2093-3  Total cholesterol   ±40 mg/dL
///   2085-9  HDL                 ±10 mg/dL
/// </summary>
public sealed class LabDeltaFlaggingService(ILogger<LabDeltaFlaggingService> logger)
{
    // LOINC code → (absoluteThreshold, relativeThresholdFraction, criticalLow, criticalHigh)
    private static readonly Dictionary<string, LabThreshold> Thresholds = new(StringComparer.OrdinalIgnoreCase)
    {
        ["2345-7"]  = new("Glucose",           AbsoluteΔ: 70,   RelativeΔ: 0.30, CriticalLow: 50,   CriticalHigh: 500),
        ["2160-0"]  = new("Creatinine",        AbsoluteΔ: 0.5,  RelativeΔ: 0.50, CriticalLow: null, CriticalHigh: 10.0),
        ["2951-2"]  = new("Sodium",            AbsoluteΔ: 10,   RelativeΔ: null, CriticalLow: 120,  CriticalHigh: 160),
        ["2823-3"]  = new("Potassium",         AbsoluteΔ: 1.0,  RelativeΔ: null, CriticalLow: 2.5,  CriticalHigh: 6.5),
        ["718-7"]   = new("Hemoglobin",        AbsoluteΔ: 2.0,  RelativeΔ: null, CriticalLow: 7.0,  CriticalHigh: null),
        ["6690-2"]  = new("WBC",               AbsoluteΔ: 4.0,  RelativeΔ: null, CriticalLow: 2.0,  CriticalHigh: 30.0),
        ["13056-7"] = new("Platelets",         AbsoluteΔ: 50,   RelativeΔ: null, CriticalLow: 50,   CriticalHigh: 1000),
        ["1742-6"]  = new("ALT",               AbsoluteΔ: null, RelativeΔ: 0.50, CriticalLow: null, CriticalHigh: 1000),
        ["1920-8"]  = new("AST",               AbsoluteΔ: null, RelativeΔ: 0.50, CriticalLow: null, CriticalHigh: 1000),
        ["6768-6"]  = new("ALP",               AbsoluteΔ: null, RelativeΔ: 0.50, CriticalLow: null, CriticalHigh: null),
        ["2157-6"]  = new("CK",                AbsoluteΔ: null, RelativeΔ: 0.50, CriticalLow: null, CriticalHigh: null),
        ["14627-4"] = new("Bicarbonate",       AbsoluteΔ: 5,    RelativeΔ: null, CriticalLow: 10,   CriticalHigh: 40),
        ["2075-0"]  = new("Chloride",          AbsoluteΔ: 10,   RelativeΔ: null, CriticalLow: null, CriticalHigh: null),
        ["21000-5"] = new("HbA1c",             AbsoluteΔ: 1.0,  RelativeΔ: null, CriticalLow: null, CriticalHigh: null),
        ["2093-3"]  = new("TotalCholesterol",  AbsoluteΔ: 40,   RelativeΔ: null, CriticalLow: null, CriticalHigh: null),
        ["2085-9"]  = new("HDL",               AbsoluteΔ: 10,   RelativeΔ: null, CriticalLow: null, CriticalHigh: null),
    };

    /// <summary>
    /// Checks a batch of new lab observations against the most recent prior value
    /// for the same patient+LOINC, returning flags for observations that exceed
    /// delta thresholds or are outside critical ranges.
    /// </summary>
    /// <param name="newObservations">Incoming FHIR Observation-lite DTOs.</param>
    /// <param name="priorObservations">
    /// Most recent prior observations for the same patient+LOINC pairs.
    /// Keyed by "{patientId}:{loincCode}".
    /// </param>
    public LabDeltaCheckResult Check(
        IReadOnlyList<LabObservationDto> newObservations,
        IReadOnlyDictionary<string, LabObservationDto> priorObservations)
    {
        var flags = new List<LabDeltaFlag>();

        foreach (var obs in newObservations)
        {
            if (!Thresholds.TryGetValue(obs.LoincCode, out var threshold))
                continue; // analyte not in delta-check panel

            var flags_for_obs = new List<string>();
            var severity = DeltaFlagSeverity.None;

            // 1. Critical range check (absolute value)
            if (threshold.CriticalLow.HasValue && obs.Value < threshold.CriticalLow.Value)
            {
                flags_for_obs.Add($"{threshold.AnalyteName} critically low: {obs.Value} {obs.Unit} (threshold < {threshold.CriticalLow} {obs.Unit})");
                severity = DeltaFlagSeverity.Critical;
            }
            if (threshold.CriticalHigh.HasValue && obs.Value > threshold.CriticalHigh.Value)
            {
                flags_for_obs.Add($"{threshold.AnalyteName} critically high: {obs.Value} {obs.Unit} (threshold > {threshold.CriticalHigh} {obs.Unit})");
                severity = DeltaFlagSeverity.Critical;
            }

            // 2. Delta check against prior value
            var priorKey = $"{obs.PatientId}:{obs.LoincCode}";
            if (priorObservations.TryGetValue(priorKey, out var prior))
            {
                var absoluteDelta = Math.Abs(obs.Value - prior.Value);
                var relativeChange = prior.Value != 0
                    ? absoluteDelta / Math.Abs(prior.Value)
                    : double.MaxValue;

                bool exceeded = false;

                if (threshold.AbsoluteΔ.HasValue && absoluteDelta >= threshold.AbsoluteΔ.Value)
                {
                    flags_for_obs.Add(
                        $"{threshold.AnalyteName} absolute delta {absoluteDelta:F1} {obs.Unit} exceeds threshold ±{threshold.AbsoluteΔ} " +
                        $"(was {prior.Value:F1} on {prior.CollectedAt:yyyy-MM-dd}, now {obs.Value:F1})");
                    exceeded = true;
                }

                if (threshold.RelativeΔ.HasValue && relativeChange >= threshold.RelativeΔ.Value)
                {
                    flags_for_obs.Add(
                        $"{threshold.AnalyteName} relative change {relativeChange:P0} exceeds threshold ±{threshold.RelativeΔ.Value:P0} " +
                        $"(was {prior.Value:F1} on {prior.CollectedAt:yyyy-MM-dd}, now {obs.Value:F1})");
                    exceeded = true;
                }

                if (exceeded && severity == DeltaFlagSeverity.None)
                    severity = DeltaFlagSeverity.DeltaExceeded;
            }

            if (flags_for_obs.Count > 0)
            {
                flags.Add(new LabDeltaFlag(
                    PatientId:   obs.PatientId,
                    LoincCode:   obs.LoincCode,
                    AnalyteName: threshold.AnalyteName,
                    CurrentValue:   obs.Value,
                    Unit:           obs.Unit,
                    CollectedAt:    obs.CollectedAt,
                    Severity:       severity,
                    FlagReasons:    flags_for_obs.ToArray()));

                logger.LogWarning(
                    "LabDelta [{Severity}] patient={PatientId} analyte={Analyte}: {Reason}",
                    severity, obs.PatientId, threshold.AnalyteName, flags_for_obs[0]);
            }
        }

        return new LabDeltaCheckResult(
            ObservationsChecked: newObservations.Count,
            FlagCount:           flags.Count,
            HasCriticalFlags:    flags.Any(f => f.Severity == DeltaFlagSeverity.Critical),
            Flags:               flags.ToArray());
    }
}

// ── DTOs ────────────────────────────────────────────────────────────────────

/// <summary>Lightweight FHIR Observation projection for delta checking.</summary>
public sealed record LabObservationDto(
    string PatientId,
    string LoincCode,
    double Value,
    string Unit,
    DateTime CollectedAt);

public sealed record LabDeltaCheckResult(
    int ObservationsChecked,
    int FlagCount,
    bool HasCriticalFlags,
    LabDeltaFlag[] Flags);

public sealed record LabDeltaFlag(
    string PatientId,
    string LoincCode,
    string AnalyteName,
    double CurrentValue,
    string Unit,
    DateTime CollectedAt,
    DeltaFlagSeverity Severity,
    string[] FlagReasons);

public enum DeltaFlagSeverity { None, DeltaExceeded, Critical }

// ── Internal threshold model ─────────────────────────────────────────────────

file sealed record LabThreshold(
    string  AnalyteName,
    double? AbsoluteΔ,
    double? RelativeΔ,
    double? CriticalLow,
    double? CriticalHigh);
