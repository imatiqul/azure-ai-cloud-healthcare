using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.Messaging;

public static class EventHubExtensions
{
    /// <summary>
    /// Registers Azure Event Hubs audit service.
    /// Reads <c>EventHubs:AuditConnectionString</c> and <c>EventHubs:AuditHubName</c> from configuration.
    /// Gracefully degrades to structured logging when not configured (local dev / test).
    /// </summary>
    public static IServiceCollection AddEventHubAudit(this IServiceCollection services)
    {
        services.AddSingleton<IEventHubAuditService, EventHubAuditService>();
        return services;
    }
}
