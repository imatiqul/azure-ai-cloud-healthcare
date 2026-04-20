using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.Billing;

public interface IUsageMeteringService
{
    Task TrackAsync(Guid tenantId, string dimension, double quantity, CancellationToken ct = default);
    Task FlushAsync(HttpClient http, CancellationToken ct = default);
}

public sealed record UsageMeteringOptions(
    string ResourceId = "",   // Azure Marketplace SaaS subscription resource ID
    string PlanId = "standard");

public static class UsageMeteringExtensions
{
    public static IServiceCollection AddUsageMetering(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var options = new UsageMeteringOptions(
            ResourceId: configuration["AzureMarketplace:ResourceId"] ?? string.Empty,
            PlanId: configuration["AzureMarketplace:PlanId"] ?? "standard");

        services.AddSingleton(options);
        services.AddSingleton<IUsageMeteringService, UsageMeteringService>();
        services.AddHttpClient("MarketplaceMetering");
        services.AddHostedService<UsageMeteringFlushJob>();

        return services;
    }
}
