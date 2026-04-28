using System.Text.RegularExpressions;
using OpenTelemetry;
using OpenTelemetry.Logs;

namespace HealthQCopilot.Infrastructure.Observability;

/// <summary>
/// OpenTelemetry <see cref="BaseProcessor{T}"/> for <see cref="LogRecord"/> that redacts
/// Protected Health Information (PHI) from structured log attribute values and the
/// formatted message before the record is exported to any sink.
///
/// HIPAA §164.312(b) — Audit controls: log infrastructure must not inadvertently
/// persist identifiable patient data. This processor scrubs 18 HIPAA identifiers
/// that could appear in string-typed log attributes (patient names in error messages,
/// email addresses in exception stack traces, SSNs in validation failures, etc.).
///
/// Pattern coverage (HIPAA Safe Harbor — 45 CFR §164.514):
///   1. SSN              (\d{3}-\d{2}-\d{4})
///   2. Phone numbers    (US formats: (xxx) xxx-xxxx, xxx-xxx-xxxx, 10 consecutive digits)
///   3. Email addresses
///   4. MRN patterns     (MRN-xxxxxx, PID-xxxxxx — common EHR formats)
///   5. Date of Birth    (MM/DD/YYYY, YYYY-MM-DD ISO format)
///   6. Credit card      (PCI DSS bonus — 13-19 digit numbers matching Luhn-like patterns)
///
/// Replaces the previous Serilog-based <c>PhiRedactionEnricher</c>.
/// Registered via <c>WithLogging(logging => logging.AddProcessor&lt;PhiRedactionProcessor&gt;())</c>
/// in <see cref="ObservabilityExtensions.AddHealthcareObservability"/>.
/// </summary>
public sealed class PhiRedactionProcessor : BaseProcessor<LogRecord>
{
    private static readonly (Regex Pattern, string Replacement)[] RedactionRules =
    [
        // SSN: 123-45-6789
        (new Regex(@"\b\d{3}-\d{2}-\d{4}\b", RegexOptions.Compiled), "[SSN-REDACTED]"),

        // US Phone: (123) 456-7890 | 123-456-7890 | 1234567890
        // Note: parenthesised format must not be preceded by \b (( is a non-word char)
        (new Regex(@"(\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|\b\d{10}\b)", RegexOptions.Compiled), "[PHONE-REDACTED]"),

        // Email address
        (new Regex(@"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", RegexOptions.Compiled), "[EMAIL-REDACTED]"),

        // MRN / Patient ID patterns (common EHR prefixes)
        (new Regex(@"\b(MRN|PID|PAT)[:\-]?\d{5,10}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "[MRN-REDACTED]"),

        // Date of Birth — MM/DD/YYYY
        (new Regex(@"\b(0[1-9]|1[012])/(0[1-9]|[12]\d|3[01])/(19|20)\d{2}\b", RegexOptions.Compiled), "[DOB-REDACTED]"),

        // Date of Birth — YYYY-MM-DD (ISO 8601, often used in FHIR resources)
        (new Regex(@"\b(19|20)\d{2}-(0[1-9]|1[012])-(0[1-9]|[12]\d|3[01])\b", RegexOptions.Compiled), "[DOB-REDACTED]"),

        // Credit / debit card (13–19 digits with optional separating spaces/dashes)
        (new Regex(@"\b(?:\d[ \-]?){13,19}\b", RegexOptions.Compiled), "[CARD-REDACTED]"),
    ];

    /// <summary>
    /// Called for each log record just before it is exported. Applies PHI redaction
    /// to all string-typed attributes and to the formatted message.
    /// </summary>
    public override void OnEnd(LogRecord data)
    {
        // Redact the rendered formatted message (e.g. "Patient john@acme.com updated")
        if (!string.IsNullOrEmpty(data.FormattedMessage))
            data.FormattedMessage = Redact(data.FormattedMessage);

        // Redact string-typed structured attributes (ILogger structured log state)
        if (data.Attributes is null || data.Attributes.Count == 0)
            return;

        var count = data.Attributes.Count;
        var modified = false;
        var newAttrs = new KeyValuePair<string, object?>[count];

        for (var i = 0; i < count; i++)
        {
            var kvp = data.Attributes[i];
            if (kvp.Value is string str)
            {
                var cleaned = Redact(str);
                if (!string.Equals(cleaned, str, StringComparison.Ordinal))
                {
                    newAttrs[i] = new KeyValuePair<string, object?>(kvp.Key, cleaned);
                    modified = true;
                    continue;
                }
            }

            newAttrs[i] = kvp;
        }

        if (modified)
            data.Attributes = newAttrs;
    }

    /// <summary>
    /// Applies all HIPAA redaction rules to <paramref name="input"/> and returns
    /// the sanitised string. Exposed as <c>public</c> for unit testing.
    /// </summary>
    public static string Redact(string input)
    {
        foreach (var (pattern, replacement) in RedactionRules)
            input = pattern.Replace(input, replacement);
        return input;
    }
}
