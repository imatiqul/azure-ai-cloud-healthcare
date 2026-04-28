using Azure.Monitor.OpenTelemetry.Exporter;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

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

                // Standard OTLP export — activated when OTEL_EXPORTER_OTLP_ENDPOINT is set
                // (e.g. Grafana Tempo, Jaeger, or Honeycomb via env var in AKS deployment)
                var otlpEndpoint = config["OTEL_EXPORTER_OTLP_ENDPOINT"];
                if (!string.IsNullOrEmpty(otlpEndpoint))
                    t.AddOtlpExporter(opt =>
                    {
                        opt.Endpoint = new Uri(otlpEndpoint);
                        opt.Protocol = OtlpExportProtocol.HttpProtobuf;
                    });
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

                // OTLP metrics export (Prometheus OTLP receiver / Grafana Cloud)
                var otlpEndpoint = config["OTEL_EXPORTER_OTLP_ENDPOINT"];
                if (!string.IsNullOrEmpty(otlpEndpoint))
                    m.AddOtlpExporter(opt =>
                    {
                        opt.Endpoint = new Uri(otlpEndpoint);
                        opt.Protocol = OtlpExportProtocol.HttpProtobuf;
                    });
            })
            .WithLogging(logging =>
            {
                // HIPAA §164.312(b) — scrub PHI from every log record before export
                logging.AddProcessor(new PhiRedactionProcessor());

                // Forward logs to Azure Application Insights when connection string is present
                var aiConnStr = config["ApplicationInsights:ConnectionString"];
                if (!string.IsNullOrEmpty(aiConnStr))
                    logging.AddAzureMonitorLogExporter(opt => opt.ConnectionString = aiConnStr);
            });

        return services;
    }
}
