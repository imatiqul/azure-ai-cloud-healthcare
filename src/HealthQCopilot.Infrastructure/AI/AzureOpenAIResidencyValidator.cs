using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// W1.3 — fails fast at startup if the configured Azure OpenAI endpoint is not
/// in the <c>AzureOpenAI:AllowedRegions</c> allow-list. The region is parsed
/// from the canonical endpoint hostname
/// (<c>https://{name}.openai.azure.com</c> with deployment region encoded in
/// the resource name or via the linked Cognitive Services resource).
///
/// When the endpoint is empty (local/dev) the check is skipped.
/// </summary>
public sealed class AzureOpenAIResidencyValidator(
    IConfiguration config,
    ILogger<AzureOpenAIResidencyValidator> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var endpoint = config["AzureOpenAI:Endpoint"];
        var allowed = config.GetSection("AzureOpenAI:AllowedRegions").Get<string[]>() ?? Array.Empty<string>();

        if (string.IsNullOrWhiteSpace(endpoint))
        {
            logger.LogInformation("Azure OpenAI endpoint not configured; data-residency check skipped.");
            return Task.CompletedTask;
        }

        if (allowed.Length == 0)
        {
            logger.LogWarning("AzureOpenAI:AllowedRegions is empty; HIPAA data-residency policy not enforced.");
            return Task.CompletedTask;
        }

        // Hostname convention: aoai-{name}-{region}.openai.azure.com or {name}.openai.azure.com.
        // We accept a match if any allowed region appears as a substring of the lowercased host.
        var host = new Uri(endpoint).Host.ToLowerInvariant();
        var match = allowed.FirstOrDefault(r => host.Contains(r.ToLowerInvariant(), StringComparison.Ordinal));

        if (match is null)
        {
            var msg = $"Azure OpenAI endpoint host '{host}' is not in the allow-list [{string.Join(", ", allowed)}]. Refusing to start (HIPAA data-residency).";
            logger.LogCritical(msg);
            throw new InvalidOperationException(msg);
        }

        logger.LogInformation("Azure OpenAI residency check passed: host={Host}, region={Region}", host, match);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
