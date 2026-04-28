using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace HealthQCopilot.ServiceDefaults.HealthChecks;

/// <summary>
/// W1.3 — Data-residency policy enforcement for Azure OpenAI.
///
/// Validates that the configured Azure OpenAI endpoint resolves to a region in
/// <c>AzureOpenAI:AllowedRegions</c>. A region outside the allow-list fails the
/// <c>ready</c> probe so Kubernetes stops routing traffic and the pod is
/// quarantined — equivalent to a hard-fail startup gate, but without the
/// crash-loop risk in dev environments where region metadata is missing.
///
/// Region resolution order:
///   1. Explicit <c>AzureOpenAI:Region</c> config (operator-set; canonical).
///   2. Best-effort host parse from <c>AzureOpenAI:Endpoint</c>
///      (e.g. <c>my-aoai.eastus2.openai.azure.com</c>) — second-leftmost label
///      when the host has &gt;= 4 labels and the second label looks like an
///      Azure region slug (lowercase letters + optional digits).
///
/// Outcomes:
///   - No <c>AzureOpenAI:Endpoint</c>             → Healthy ("not configured").
///   - No <c>AzureOpenAI:AllowedRegions</c>       → Healthy ("allow-list not enforced").
///   - Region cannot be resolved                  → Degraded.
///   - Region resolved AND not in allow-list      → Unhealthy.
///   - Region resolved AND in allow-list          → Healthy.
/// </summary>
public sealed class AzureOpenAIRegionHealthCheck : IHealthCheck
{
    private readonly IConfiguration _config;

    public AzureOpenAIRegionHealthCheck(IConfiguration config)
    {
        _config = config;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var endpoint = _config["AzureOpenAI:Endpoint"];
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return Task.FromResult(HealthCheckResult.Healthy("Azure OpenAI not configured"));
        }

        var allowed = _config.GetSection("AzureOpenAI:AllowedRegions").Get<string[]>()
                      ?? Array.Empty<string>();
        if (allowed.Length == 0)
        {
            return Task.FromResult(HealthCheckResult.Healthy(
                "AzureOpenAI:AllowedRegions not configured — allow-list not enforced"));
        }

        var region = _config["AzureOpenAI:Region"];
        if (string.IsNullOrWhiteSpace(region))
        {
            region = TryParseRegionFromEndpoint(endpoint);
        }

        if (string.IsNullOrWhiteSpace(region))
        {
            return Task.FromResult(HealthCheckResult.Degraded(
                "Cannot determine Azure OpenAI region — set AzureOpenAI:Region explicitly to enforce data-residency policy.",
                data: new Dictionary<string, object> { ["endpoint"] = endpoint }));
        }

        var inAllowList = allowed.Any(r =>
            string.Equals(r?.Trim(), region.Trim(), StringComparison.OrdinalIgnoreCase));

        var data = new Dictionary<string, object>
        {
            ["region"] = region,
            ["allowedRegions"] = allowed,
        };

        return Task.FromResult(inAllowList
            ? HealthCheckResult.Healthy(
                $"Azure OpenAI region '{region}' is within the configured allow-list.",
                data: data)
            : HealthCheckResult.Unhealthy(
                $"Azure OpenAI region '{region}' violates AzureOpenAI:AllowedRegions data-residency policy.",
                data: data));
    }

    /// <summary>Best-effort: pull the region slug from an AOAI hostname.</summary>
    /// <remarks>
    /// AOAI custom-domain endpoints look like
    /// <c>https://{resource}.{region}.openai.azure.com/</c> or
    /// <c>https://{resource}.{region}.cognitiveservices.azure.com/</c>. Some
    /// older endpoints embed no region (<c>{resource}.openai.azure.com</c>);
    /// callers who need strict enforcement must set <c>AzureOpenAI:Region</c>.
    /// </remarks>
    internal static string? TryParseRegionFromEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
        {
            return null;
        }

        var labels = uri.Host.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (labels.Length < 4)
        {
            return null;
        }

        var candidate = labels[1];
        // Azure region slugs are all-lowercase letters with an optional trailing digit
        // (eastus, eastus2, westeurope, swedencentral). Anything else (e.g. "openai")
        // means no region is encoded in the host.
        var isRegionSlug = candidate.Length >= 4
            && candidate.All(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))
            && candidate[0] >= 'a' && candidate[0] <= 'z';

        return isRegionSlug && candidate != "openai" && candidate != "cognitiveservices"
            ? candidate
            : null;
    }
}
