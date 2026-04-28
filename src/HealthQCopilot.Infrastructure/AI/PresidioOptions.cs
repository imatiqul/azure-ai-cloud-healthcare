namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Configuration for the Microsoft Presidio sidecar used by
/// <see cref="PresidioPhiRedactor"/>. When <see cref="AnalyzerEndpoint"/> is
/// empty the agents service falls back to <see cref="RegexPhiRedactor"/>.
/// </summary>
public sealed class PresidioOptions
{
    public const string SectionName = "Presidio";

    /// <summary>Base URL of the Presidio analyzer (e.g., http://localhost:5001).</summary>
    public string AnalyzerEndpoint { get; set; } = string.Empty;

    /// <summary>HTTP timeout for analyzer calls. Defaults to 2 seconds.</summary>
    public int TimeoutMs { get; set; } = 2000;

    /// <summary>
    /// Minimum confidence (0–1) required to redact an entity. Lower = more
    /// aggressive masking. Default 0.5 matches Presidio's recommendation.
    /// </summary>
    public double MinScore { get; set; } = 0.5;

    /// <summary>
    /// Entity types Presidio should detect. Defaults cover common HIPAA
    /// identifiers; clinical-specific recognizers should be added via Presidio
    /// configuration (custom recognizers) on the sidecar.
    /// </summary>
    public string[] Entities { get; set; } =
    [
        "PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "US_SSN",
        "DATE_TIME", "LOCATION", "MEDICAL_LICENSE", "US_DRIVER_LICENSE"
    ];
}
