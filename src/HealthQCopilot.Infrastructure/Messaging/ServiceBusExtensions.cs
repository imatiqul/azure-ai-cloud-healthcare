using Azure.Messaging.ServiceBus;
using HealthQCopilot.Infrastructure.Behaviors;
using HealthQCopilot.Infrastructure.Persistence;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.Messaging;

public static class ServiceBusExtensions
{
    /// <summary>
    /// Registers the domain event dispatcher (MediatR-based), the generic EF Core
    /// unit of work, and the shared CQRS pipeline behaviors (logging + validation).
    /// Call after AddMediatR() so IPublisher is already registered.
    /// </summary>
    public static IServiceCollection AddDomainEvents<TContext>(this IServiceCollection services)
        where TContext : Microsoft.EntityFrameworkCore.DbContext
    {
        services.AddScoped<DomainEventDispatcher>();
        services.AddScoped<HealthQCopilot.Domain.Primitives.IUnitOfWork,
            EfUnitOfWork<TContext>>();

        // CQRS pipeline: logging runs first, then FluentValidation for every request.
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        return services;
    }


    /// <summary>
    /// Registers the outbox relay and Service Bus sender when a "ServiceBus" connection string is configured.
    /// When absent, the outbox relay is skipped, allowing the service to start without Service Bus.
    /// </summary>
    public static IServiceCollection AddOutboxRelay<TContext>(
        this IServiceCollection services, IConfiguration configuration)
        where TContext : OutboxDbContext
    {
        var connectionString = configuration.GetConnectionString("ServiceBus");

        if (string.IsNullOrWhiteSpace(connectionString))
            return services;

        services.AddSingleton(sp =>
        {
            var client = new ServiceBusClient(connectionString);
            return client.CreateSender("outbox-events");
        });
        services.AddHostedService<OutboxRelayService<TContext>>();

        return services;
    }
}
