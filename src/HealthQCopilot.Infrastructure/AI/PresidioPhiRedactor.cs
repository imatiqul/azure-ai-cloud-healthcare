using System.Net.Http.Json;
using System.Text.Json.Serialization;
using HealthQCopilot.Domain.Agents.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Microsoft Presidio-backed PHI redactor (W1.1). Calls the analyzer sidecar
/// over HTTP to detect entity offsets, then masks them locally and produces a
/// reversible token map for re-hydration on outputs. Falls through to the
/// regex implementation if the sidecar is unreachable or returns an error so
/// the agent loop never fails closed on a transient infra issue.
/// </summary>
public sealed class PresidioPhiRedactor(
    HttpClient httpClient,
    IOptions<PresidioOptions> options,
    RegexPhiRedactor fallback,
    ILogger<PresidioPhiRedactor> logger) : IPhiRedactor
{
    private readonly PresidioOptions _options = options.Value;

    public async Task<RedactionResult> RedactAsync(string input, string sessionId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(input))
        {
            return new RedactionResult(input, new Dictionary<string, string>(), [], "presidio", false);
        }

        AnalyzerResult[]? analyzerEntities;
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromMilliseconds(_options.TimeoutMs));

            var request = new AnalyzerRequest(input, "en", _options.Entities, _options.MinScore);
            var response = await httpClient.PostAsJsonAsync("analyze", request, cts.Token);
            response.EnsureSuccessStatusCode();
            analyzerEntities = await response.Content.ReadFromJsonAsync<AnalyzerResult[]>(cts.Token);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            logger.LogWarning(ex,
                "Presidio analyzer unreachable for session {SessionId}; falling back to regex redactor",
                sessionId);
            var regexResult = await fallback.RedactAsync(input, sessionId, ct);
            return regexResult with { Strategy = "regex-fallback" };
        }

        if (analyzerEntities is null || analyzerEntities.Length == 0)
        {
            return new RedactionResult(input, new Dictionary<string, string>(), [], "presidio", false);
        }

        // Mask in reverse offset order so earlier offsets stay valid.
        var ordered = analyzerEntities
            .Where(e => e.Score >= _options.MinScore && e.Start >= 0 && e.End > e.Start && e.End <= input.Length)
            .OrderByDescending(e => e.Start)
            .ToArray();

        var tokenMap = new Dictionary<string, string>(StringComparer.Ordinal);
        var entities = new List<RedactionEntity>(ordered.Length);
        var working = input;
        var counter = 0;

        foreach (var ent in ordered)
        {
            counter++;
            var token = $"<PHI:{ent.EntityType}_{counter}>";
            var original = input.Substring(ent.Start, ent.End - ent.Start);
            tokenMap[token] = original;
            entities.Add(new RedactionEntity(ent.EntityType, ent.Start, ent.End, ent.Score, token));
            working = string.Concat(working.AsSpan(0, ent.Start), token, working.AsSpan(ent.End));
        }

        if (entities.Count > 0)
        {
            logger.LogInformation(
                "Presidio masked {Count} entities for session {SessionId}",
                entities.Count, sessionId);
        }

        // Presidio output already redacted; residual heuristic stays false.
        return new RedactionResult(working, tokenMap, entities, "presidio", ResidualPhiSuspected: false);
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

    // Wire-format DTOs matching Presidio's REST API.
    private sealed record AnalyzerRequest(
        [property: JsonPropertyName("text")] string Text,
        [property: JsonPropertyName("language")] string Language,
        [property: JsonPropertyName("entities")] string[] Entities,
        [property: JsonPropertyName("score_threshold")] double ScoreThreshold);

    private sealed record AnalyzerResult(
        [property: JsonPropertyName("entity_type")] string EntityType,
        [property: JsonPropertyName("start")] int Start,
        [property: JsonPropertyName("end")] int End,
        [property: JsonPropertyName("score")] double Score);
}
