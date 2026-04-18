using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.RealTime;

public static class WebPubSubExtensions
{
    /// <summary>
    /// Registers Azure Web PubSub push service.
    /// Reads <c>WebPubSub:ConnectionString</c> and <c>WebPubSub:HubName</c> from configuration.
    /// Gracefully degrades to no-op when not configured (local dev / test).
    /// </summary>
    public static IServiceCollection AddWebPubSubService(this IServiceCollection services)
    {
        services.AddSingleton<IWebPubSubService, WebPubSubService>();
        return services;
    }
}
