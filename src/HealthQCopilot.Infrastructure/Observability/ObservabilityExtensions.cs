using Azure.Monitor.OpenTelemetry.Exporter;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Formatting.Compact;

namespace HealthQCopilot.Infrastructure.Observability;

public static class ObservabilityExtensions
{
    public static IServiceCollection AddHealthcareObservability(
        this IServiceCollection services, IConfiguration config, string serviceName)
    {
        services.AddOpenTelemetry()
            .ConfigureResource(r => r
                .AddService(serviceName, serviceVersion: config["App:Version"] ?? "1.0.0")
                .AddAttributes(new Dictionary<string, object>
                {
                    ["deployment.environment"] = config["ASPNETCORE_ENVIRONMENT"] ?? "Production",
                    ["service.namespace"] = "healthcare-ai",
                }))
            .WithTracing(t =>
            {
                t.AddAspNetCoreInstrumentation(opt =>
                    {
                        opt.RecordException = true;
                        opt.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");
                    })
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation()
                    .AddSource("Dapr.Client")
                    .AddSource("HealthQCopilot.*");

                var aiConnStr = config["ApplicationInsights:ConnectionString"];
                if (!string.IsNullOrEmpty(aiConnStr))
                    t.AddAzureMonitorTraceExporter(opt => opt.ConnectionString = aiConnStr);
            })
            .WithMetrics(m =>
            {
                m.AddAspNetCoreInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddMeter("HealthQCopilot.VoiceService")
                    .AddMeter("HealthQCopilot.AgentService")
                    .AddMeter("HealthQCopilot.FhirService")
                    .AddMeter("HealthQCopilot.SchedulingService")
                    .AddMeter("HealthQCopilot.OcrService")
                    .AddMeter("HealthQCopilot.NotificationService")
                    .AddMeter("HealthQCopilot.PopulationHealthService")
                    .AddMeter("HealthQCopilot.RevenueCycleService")
                    .AddMeter("HealthQCopilot.IdentityService")
                    .AddMeter("HealthQCopilot.GuideService")
                    .AddMeter("HealthQCopilot.Business")
                    .AddPrometheusExporter();

        services.AddSingleton<BusinessMetrics>();

                var aiConnStr = config["ApplicationInsights:ConnectionString"];
                if (!string.IsNullOrEmpty(aiConnStr))
                    m.AddAzureMonitorMetricExporter(opt => opt.ConnectionString = aiConnStr);
            });

        Log.Logger = new LoggerConfiguration()
            .ReadFrom.Configuration(config)
            .Enrich.WithCorrelationId()
            .Enrich.WithProperty("ServiceName", serviceName)
            .WriteTo.Console(new RenderedCompactJsonFormatter())
            .CreateLogger();

        services.AddSerilog();

        return services;
    }
}
