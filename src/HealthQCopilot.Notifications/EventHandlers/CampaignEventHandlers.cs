using Dapr.Client;
using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Notifications.EventHandlers;

/// <summary>
/// Handles CampaignActivated domain event.
///
/// When a campaign goes live, the Notification Service must:
///   1. Publish to Dapr topic "campaign.activated" so the Population Health
///      dashboard and Analytics service can update their campaign tracking views.
///   2. Log for operational audit.
///
/// The actual message dispatch is already wired into the Campaign's scheduling
/// service — this handler is responsible for cross-service notification only.
/// </summary>
public sealed class CampaignActivatedHandler(
    DaprClient dapr,
    ILogger<CampaignActivatedHandler> logger)
    : INotificationHandler<DomainEventNotification<CampaignActivated>>
{
    public async Task Handle(
        DomainEventNotification<CampaignActivated> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "campaign.activated",
            data: new
            {
                CampaignId = evt.CampaignId,
                Name = evt.Name,
                Type = evt.Type.ToString(),
                ScheduledAt = evt.ScheduledAt,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "Notification: Campaign '{Name}' ({CampaignId}) activated — Type={Type} ScheduledAt={ScheduledAt}",
            evt.Name, evt.CampaignId, evt.Type, evt.ScheduledAt);
    }
}

/// <summary>
/// Handles CampaignCompleted domain event — all messages dispatched, outcomes ready.
/// Publishes to "campaign.completed" for analytics aggregation.
/// </summary>
public sealed class CampaignCompletedHandler(
    DaprClient dapr,
    ILogger<CampaignCompletedHandler> logger)
    : INotificationHandler<DomainEventNotification<CampaignCompleted>>
{
    public async Task Handle(
        DomainEventNotification<CampaignCompleted> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "campaign.completed",
            data: new
            {
                CampaignId = evt.CampaignId,
                Name = evt.Name,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "Notification: Campaign '{Name}' ({CampaignId}) completed",
            evt.Name, evt.CampaignId);
    }
}

/// <summary>
/// Handles CampaignCancelled domain event.
/// Publishes to "campaign.cancelled" so in-flight scheduled messages can be suppressed.
/// </summary>
public sealed class CampaignCancelledHandler(
    DaprClient dapr,
    ILogger<CampaignCancelledHandler> logger)
    : INotificationHandler<DomainEventNotification<CampaignCancelled>>
{
    public async Task Handle(
        DomainEventNotification<CampaignCancelled> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "campaign.cancelled",
            data: new
            {
                CampaignId = evt.CampaignId,
                Name = evt.Name,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogWarning(
            "Notification: Campaign '{Name}' ({CampaignId}) CANCELLED",
            evt.Name, evt.CampaignId);
    }
}
