using System.Text.RegularExpressions;
using HealthQCopilot.Domain.Agents.Contracts;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Conservative regex-based PHI redactor used as the default when a Presidio
/// sidecar is not yet wired in. Catches common identifiers (MRN, SSN, phone,
/// email, DOB) and produces a reversible token map. Production deployments
/// should replace this with the Presidio-backed implementation in W1.1.
/// </summary>
public sealed partial class RegexPhiRedactor(ILogger<RegexPhiRedactor> logger) : IPhiRedactor
{
    private static readonly (string Type, Regex Pattern)[] s_patterns =
    [
        ("SSN",   SsnRegex()),
        ("MRN",   MrnRegex()),
        ("PHONE", PhoneRegex()),
        ("EMAIL", EmailRegex()),
        ("DOB",   DobRegex())
    ];

    public Task<RedactionResult> RedactAsync(string input, string sessionId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(input))
        {
            return Task.FromResult(new RedactionResult(input, new Dictionary<string, string>(), [], "regex-fallback", false));
        }

        var tokenMap = new Dictionary<string, string>(StringComparer.Ordinal);
        var entities = new List<RedactionEntity>();
        var working = input;
        var counter = 0;

        foreach (var (type, pattern) in s_patterns)
        {
            working = pattern.Replace(working, m =>
            {
                counter++;
                var token = $"<PHI:{type}_{counter}>";
                tokenMap[token] = m.Value;
                entities.Add(new RedactionEntity(type, m.Index, m.Index + m.Length, 0.85, token));
                return token;
            });
        }

        if (entities.Count > 0)
        {
            logger.LogInformation("PHI redactor masked {Count} entities for session {SessionId}", entities.Count, sessionId);
        }

        // Heuristic: unredacted long uppercase tokens may be names; flag for review but do not block.
        var residualSuspected = ResidualHeuristic().IsMatch(working);

        return Task.FromResult(new RedactionResult(working, tokenMap, entities, "regex-fallback", residualSuspected));
    }

    public string Rehydrate(string redactedOutput, IReadOnlyDictionary<string, string> tokenMap)
    {
        if (string.IsNullOrEmpty(redactedOutput) || tokenMap.Count == 0) return redactedOutput;
        var result = redactedOutput;
        foreach (var (token, original) in tokenMap)
        {
            result = result.Replace(token, original, StringComparison.Ordinal);
        }
        return result;
    }

    [GeneratedRegex(@"\b\d{3}-\d{2}-\d{4}\b")] private static partial Regex SsnRegex();
    [GeneratedRegex(@"\bMRN[:\s-]*\d{6,10}\b", RegexOptions.IgnoreCase)] private static partial Regex MrnRegex();
    [GeneratedRegex(@"\b(?:\+?1[-\s.]?)?\(?\d{3}\)?[-\s.]?\d{3}[-\s.]?\d{4}\b")] private static partial Regex PhoneRegex();
    [GeneratedRegex(@"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", RegexOptions.IgnoreCase)] private static partial Regex EmailRegex();
    [GeneratedRegex(@"\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b")] private static partial Regex DobRegex();
    [GeneratedRegex(@"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b")] private static partial Regex ResidualHeuristic();
}
