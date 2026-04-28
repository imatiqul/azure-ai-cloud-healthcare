using System.Net.Http.Json;
using System.Text.Json.Serialization;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.Options;

namespace HealthQCopilot.Agents.Evaluation;

/// <summary>
/// W3.3 — Toxicity / bias screener. Wraps Azure AI Content Safety so callers
/// (eval harness, runtime guardrails) can emit standardized severity scores and
/// audit events without depending on the SDK directly.
/// </summary>
public interface IToxicityScreener
{
    Task<ToxicityResult> ScreenAsync(string text, CancellationToken ct = default);
}

/// <summary>Aggregated toxicity result. Severity is normalized to 0.0–1.0 (Azure CS reports 0/2/4/6 → divide by 6).</summary>
public sealed record ToxicityResult(
    bool Flagged,
    double MaxSeverity,
    string? MaxCategory,
    IReadOnlyDictionary<string, double> CategorySeverities)
{
    public static readonly ToxicityResult Clean = new(false, 0d, null, new Dictionary<string, double>());
}

public sealed class ToxicityScreenerOptions
{
    public const string SectionName = "ContentSafety";
    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = "2024-09-01";
    /// <summary>Normalized severity (0.0–1.0) at or above which an answer is flagged. Default 0.34 (~ Azure severity 2).</summary>
    public double Threshold { get; set; } = 0.34;
}

/// <summary>Default screener used when Content Safety is not configured. Returns clean and emits nothing.</summary>
public sealed class NoopToxicityScreener : IToxicityScreener
{
    public Task<ToxicityResult> ScreenAsync(string text, CancellationToken ct = default)
        => Task.FromResult(ToxicityResult.Clean);
}

/// <summary>Azure AI Content Safety REST client (text:analyze). Emits OTel metric + audit log on flag.</summary>
public sealed class AzureContentSafetyToxicityScreener(
    HttpClient http,
    IOptions<ToxicityScreenerOptions> options,
    BusinessMetrics metrics,
    ILogger<AzureContentSafetyToxicityScreener> logger) : IToxicityScreener
{
    private readonly ToxicityScreenerOptions _opts = options.Value;
    private static readonly string[] Categories = ["Hate", "Violence", "SelfHarm", "Sexual"];
    private const double AzureMaxSeverity = 6d;

    public async Task<ToxicityResult> ScreenAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return ToxicityResult.Clean;
        if (string.IsNullOrWhiteSpace(_opts.Endpoint)) return ToxicityResult.Clean;

        var url = $"{_opts.Endpoint.TrimEnd('/')}/contentsafety/text:analyze?api-version={_opts.ApiVersion}";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = JsonContent.Create(new AnalyzeRequest(text, Categories)),
            };
            if (!string.IsNullOrWhiteSpace(_opts.ApiKey))
                req.Headers.Add("Ocp-Apim-Subscription-Key", _opts.ApiKey);

            using var resp = await http.SendAsync(req, ct);
            resp.EnsureSuccessStatusCode();
            var body = await resp.Content.ReadFromJsonAsync<AnalyzeResponse>(cancellationToken: ct);
            if (body?.CategoriesAnalysis is null) return ToxicityResult.Clean;

            var perCategory = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            string? maxCat = null;
            double maxSev = 0d;
            foreach (var c in body.CategoriesAnalysis)
            {
                var sev = Math.Clamp(c.Severity / AzureMaxSeverity, 0d, 1d);
                perCategory[c.Category] = sev;
                if (sev > maxSev) { maxSev = sev; maxCat = c.Category; }
            }

            var flagged = maxSev >= _opts.Threshold;
            metrics.AgentToxicityScore.Record(maxSev);
            if (flagged)
            {
                metrics.AgentToxicityFlaggedTotal.Add(1,
                    new KeyValuePair<string, object?>("category", maxCat ?? "unknown"));
                logger.LogWarning(
                    "ContentSafety flagged answer: category={Category} severity={Severity}",
                    maxCat, maxSev);
            }

            return new ToxicityResult(flagged, maxSev, maxCat, perCategory);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AzureContentSafetyToxicityScreener: request failed; returning clean");
            return ToxicityResult.Clean;
        }
    }

    private sealed record AnalyzeRequest(
        [property: JsonPropertyName("text")] string Text,
        [property: JsonPropertyName("categories")] IReadOnlyList<string> Categories);

    private sealed record AnalyzeResponse(
        [property: JsonPropertyName("categoriesAnalysis")] IReadOnlyList<CategoryAnalysis>? CategoriesAnalysis);

    private sealed record CategoryAnalysis(
        [property: JsonPropertyName("category")] string Category,
        [property: JsonPropertyName("severity")] double Severity);
}
