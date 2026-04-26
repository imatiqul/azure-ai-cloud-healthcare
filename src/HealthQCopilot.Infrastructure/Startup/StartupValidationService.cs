using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Startup;

/// <summary>
/// Fail-fast startup validation: checks that all critical configuration values are
/// present before the service starts accepting traffic. Prevents silent misconfiguration
/// that would cause runtime failures deep inside request handling.
/// </summary>
public sealed class StartupValidationService(
    IConfiguration config,
    IHostEnvironment env,
    ILogger<StartupValidationService> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var errors = new List<string>();

        // ── Database ────────────────────────────────────────────────────────
        ValidateAny(errors, config,
            "ConnectionStrings:AppDb",
            "ConnectionStrings:AgentDb",
            "ConnectionStrings:AgentsDb",
            "ConnectionStrings:PopHealthDb",
            "ConnectionStrings:RevenueDb",
            "ConnectionStrings:SchedulingDb",
            "ConnectionStrings:NotificationDb",
            "ConnectionStrings:NotificationsDb",
            "ConnectionStrings:FhirDb",
            "ConnectionStrings:IdentityDb",
            "ConnectionStrings:VoiceDb",
            "ConnectionStrings:OcrDb");

        // ── Dapr pub/sub ────────────────────────────────────────────────────
        // Dapr sidecar config is injected at runtime; warn in non-Development if not found
        if (!env.IsDevelopment())
        {
            ValidateHttpReachable(errors, "DAPR_HTTP_PORT",
                "Dapr HTTP port is not set — pub/sub and state store calls will fail");
        }

        // ── Azure OpenAI ────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(config["AzureOpenAI:Endpoint"]))
        {
            if (string.IsNullOrWhiteSpace(config["AzureOpenAI:DeploymentName"]))
                errors.Add("AzureOpenAI:DeploymentName is required when AzureOpenAI:Endpoint is set");
        }

        // ── Azure App Configuration / Feature Flags ─────────────────────────
        // Optional — only validate label when endpoint is set
        if (!string.IsNullOrWhiteSpace(config["AppConfig:Endpoint"]) &&
            !Uri.TryCreate(config["AppConfig:Endpoint"], UriKind.Absolute, out _))
        {
            errors.Add("AppConfig:Endpoint is not a valid absolute URI");
        }

        if (errors.Count > 0)
        {
            foreach (var err in errors)
                logger.LogError("[StartupValidation] {Error}", err);

            throw new InvalidOperationException(
                $"Service startup failed due to {errors.Count} configuration error(s). " +
                "Review the logs above and ensure all required settings are present.");
        }

        logger.LogInformation("[StartupValidation] All critical configuration checks passed");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    // ── Helpers ─────────────────────────────────────────────────────────────

    /// <summary>Validates that at least one of the given keys has a non-empty value.</summary>
    private static void ValidateAny(List<string> errors, IConfiguration config, params string[] keys)
    {
        // For per-service validation, at least one DB connection string must be present.
        // Services only register the connection string for their own DB, so we only
        // fail if NONE of the keys are present — which would indicate a broken deployment.
        if (keys.All(k => string.IsNullOrWhiteSpace(config[k])))
        {
            errors.Add($"At least one database connection string must be configured. " +
                       $"Checked: {string.Join(", ", keys)}");
        }
    }

    private static void ValidateHttpReachable(List<string> errors, string envVar, string message)
    {
        var value = Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrWhiteSpace(value))
            errors.Add(message);
    }
}
