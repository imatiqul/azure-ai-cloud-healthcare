using Dapr.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Security;

/// <summary>
/// Replaces environment-variable secret reads with Dapr Secrets API calls
/// backed by Azure Key Vault. Zero credentials stored in environment.
/// </summary>
public sealed class DaprSecretProvider(DaprClient dapr, ILogger<DaprSecretProvider> logger)
{
    private const string DaprSecretStoreName = "azure-keyvault";

    // In-process cache to avoid repeated Dapr calls within one request/startup
    private readonly Dictionary<string, string> _cache = new(StringComparer.Ordinal);

    /// <summary>Returns the named secret from Azure Key Vault via Dapr.</summary>
    public async ValueTask<string> GetSecretAsync(string secretName, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(secretName, out var cached))
            return cached;

        try
        {
            var secrets = await dapr.GetSecretAsync(DaprSecretStoreName, secretName,
                cancellationToken: ct);

            // Key Vault returns secrets as a single-key dict with the secret name
            if (secrets.TryGetValue(secretName, out var value) && !string.IsNullOrEmpty(value))
            {
                _cache[secretName] = value;
                return value;
            }

            throw new InvalidOperationException(
                $"Secret '{secretName}' was returned empty from Key Vault.");
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            logger.LogError(ex, "Failed to retrieve secret '{SecretName}' from Dapr secret store '{Store}'",
                secretName, DaprSecretStoreName);
            throw;
        }
    }

    /// <summary>Returns the PHI encryption key (32 bytes) from Key Vault.</summary>
    public async ValueTask<byte[]> GetPhiEncryptionKeyAsync(CancellationToken ct = default)
    {
        var base64Key = await GetSecretAsync("phi-encryption-key", ct);
        var keyBytes = Convert.FromBase64String(base64Key);
        if (keyBytes.Length != 32)
            throw new InvalidOperationException(
                "PHI encryption key must be 32 bytes (AES-256). Regenerate 'phi-encryption-key' in Key Vault.");
        return keyBytes;
    }
}

/// <summary>
/// Integrates DaprSecretProvider with IConfiguration so existing config reads
/// fall through to Key Vault automatically when DAPR_HTTP_PORT is set.
/// </summary>
public static class DaprSecretProviderExtensions
{
    public static IServiceCollection AddDaprSecretProvider(this IServiceCollection services)
    {
        services.AddDaprClient();
        services.AddSingleton<DaprSecretProvider>();
        return services;
    }
}
