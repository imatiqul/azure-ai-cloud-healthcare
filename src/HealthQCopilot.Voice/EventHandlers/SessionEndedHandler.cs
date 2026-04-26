using Dapr.Client;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Voice.Events;
using MediatR;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.Voice.EventHandlers;

/// <summary>
/// Handles the SessionEnded domain event raised when a voice session terminates
/// (normally or due to timeout/network drop).
///
/// Responsibilities (in-process, post-commit):
///   1. Evict session-specific cache entries (transcript, status).
///   2. Publish to Dapr pub/sub topic "session.ended" so downstream services
///      (billing, quality audit) can react.
/// </summary>
public sealed class SessionEndedHandler(
    DaprClient dapr,
    IDistributedCache cache,
    ILogger<SessionEndedHandler> logger)
    : INotificationHandler<DomainEventNotification<SessionEnded>>
{
    public async Task Handle(
        DomainEventNotification<SessionEnded> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        // 1. Evict all session-scoped cache keys
        try
        {
            await cache.RemoveAsync($"healthq:voice:session:{evt.SessionId}", ct);
            await cache.RemoveAsync($"healthq:voice:transcript:{evt.SessionId}", ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to evict session cache for SessionId={SessionId}", evt.SessionId);
        }

        // 2. Publish integration event for downstream consumers
        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "session.ended",
            data: new
            {
                SessionId = evt.SessionId,
                Duration = evt.Duration,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "SessionEnded published to Dapr: SessionId={SessionId} Duration={Duration}",
            evt.SessionId, evt.Duration);
    }
}
