using Dapr.Client;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Voice.Events;
using MediatR;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.Voice.EventHandlers;

/// <summary>
/// Handles the TranscriptProduced domain event raised when a voice session
/// completes a speech-to-text conversion.
///
/// Responsibilities (in-process, post-commit):
///   1. Publish to Dapr pub/sub topic "transcript.produced" — the AI Agent Service
///      subscribes to this topic to initiate the triage workflow.
///   2. Evict the session transcript cache key so stale data isn't served.
/// </summary>
public sealed class TranscriptProducedHandler(
    DaprClient dapr,
    IDistributedCache cache,
    ILogger<TranscriptProducedHandler> logger)
    : INotificationHandler<DomainEventNotification<TranscriptProduced>>
{
    public async Task Handle(
        DomainEventNotification<TranscriptProduced> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        // 1. Evict cached transcript for this session (if any was cached for reads)
        try
        {
            await cache.RemoveAsync($"healthq:voice:transcript:{evt.SessionId}", ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to evict transcript cache for SessionId={SessionId}", evt.SessionId);
        }

        // 2. Publish integration event → AI Agent Service triggers triage
        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "transcript.produced",
            data: new
            {
                SessionId = evt.SessionId,
                TranscriptText = evt.TranscriptText,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "TranscriptProduced published to Dapr: SessionId={SessionId} Length={Length}",
            evt.SessionId, evt.TranscriptText.Length);
    }
}
