using Azure.Identity;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

public static class Extensions
{
    public static IHostApplicationBuilder AddServiceDefaults(this IHostApplicationBuilder builder)
    {
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();
        builder.Services.AddServiceDiscovery();
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        // Redis distributed cache — only registers when ConnectionStrings__redis is configured
        if (!string.IsNullOrEmpty(builder.Configuration.GetConnectionString("redis")))
        {
            builder.AddRedisDistributedCache("redis");
        }
        else
        {
            builder.Services.AddDistributedMemoryCache();
        }

        // Feature Management — wires Azure App Configuration when endpoint is provided.
        // Each tenant's flags are isolated by the label filter "{tenantId}" set in appsettings.
        var appConfigEndpoint = builder.Configuration["AppConfig:Endpoint"];
        if (!string.IsNullOrWhiteSpace(appConfigEndpoint))
        {
            builder.Configuration.AddAzureAppConfiguration(options =>
            {
                var tenantId = builder.Configuration["AppConfig:TenantLabel"] ?? "default";
                options.Connect(new Uri(appConfigEndpoint),
                                new DefaultAzureCredential())
                       .Select("HealthQ:*", tenantId)
                       .UseFeatureFlags(ff =>
                       {
                           ff.Select("HealthQ:*", tenantId);
                           ff.SetRefreshInterval(TimeSpan.FromMinutes(5));
                       });
            });
        }

        builder.Services.AddFeatureManagement()
                        .AddFeatureFilter<Microsoft.FeatureManagement.FeatureFilters.PercentageFilter>()
                        .AddFeatureFilter<Microsoft.FeatureManagement.FeatureFilters.TimeWindowFilter>();

        return builder;
    }

    public static IHostApplicationBuilder ConfigureOpenTelemetry(this IHostApplicationBuilder builder)
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                       .AddHttpClientInstrumentation()
                       .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddAspNetCoreInstrumentation()
                       .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static IHostApplicationBuilder AddOpenTelemetryExporters(this IHostApplicationBuilder builder)
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(
            builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    public static IHostApplicationBuilder AddDefaultHealthChecks(this IHostApplicationBuilder builder)
    {
        var checks = builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        // ── Dapr sidecar readiness (only when explicitly configured) ────────
        var daprHttpPort = builder.Configuration["DAPR_HTTP_PORT"];
        if (!string.IsNullOrWhiteSpace(daprHttpPort))
        {
            checks.AddUrlGroup(
                new Uri($"http://localhost:{daprHttpPort}/v1.0/healthz"),
                name: "dapr-sidecar",
                tags: ["ready"],
                timeout: TimeSpan.FromSeconds(3));
        }

        // ── Qdrant vector store ──────────────────────────────────────────────
        var qdrantEndpoint = builder.Configuration["Qdrant:Endpoint"];
        if (!string.IsNullOrWhiteSpace(qdrantEndpoint) &&
            Uri.TryCreate(qdrantEndpoint, UriKind.Absolute, out var qdrantUri))
        {
            checks.AddUrlGroup(
                new Uri(qdrantUri, "/healthz"),
                name: "qdrant",
                tags: ["ready"],
                timeout: TimeSpan.FromSeconds(5));
        }

        // ── Azure OpenAI ─────────────────────────────────────────────────────
        var openAiEndpoint = builder.Configuration["AzureOpenAI:Endpoint"];
        if (!string.IsNullOrWhiteSpace(openAiEndpoint) &&
            Uri.TryCreate(openAiEndpoint, UriKind.Absolute, out var openAiUri))
        {
            // Azure OpenAI health probe: HEAD on the base URL returns 200 when reachable
            checks.AddUrlGroup(
                new Uri(openAiUri, "/"),
                name: "azure-openai",
                tags: ["ready"],
                timeout: TimeSpan.FromSeconds(5));
        }

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        app.MapHealthChecks("/health", new HealthCheckOptions
        {
            ResponseWriter = WriteHealthCheckResponse
        });
        app.MapHealthChecks("/alive", new HealthCheckOptions
        {
            Predicate = r => r.Tags.Contains("live")
        });
        app.MapHealthChecks("/ready", new HealthCheckOptions
        {
            Predicate = r => r.Tags.Contains("ready"),
            ResponseWriter = WriteHealthCheckResponse
        });

        return app;
    }

    private static async Task WriteHealthCheckResponse(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";
        var result = new
        {
            status = report.Status.ToString(),
            duration = report.TotalDuration.TotalMilliseconds,
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                duration = e.Value.Duration.TotalMilliseconds,
                error = e.Value.Exception?.Message
            })
        };
        await context.Response.WriteAsJsonAsync(result);
    }
}
