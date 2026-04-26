using Dapr.Client;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Scheduling.Events;
using MediatR;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.Scheduling.EventHandlers;

/// <summary>
/// Handles the SlotBooked domain event raised when a slot transitions from
/// Reserved → Booked.
///
/// Responsibilities (in-process, post-commit):
///   1. Evict the scheduling stats cache so the next query reflects real counts.
///   2. Publish an integration event via Dapr pub/sub so the AI Agent Service
///      can update the TriageWorkflow and downstream services are notified.
/// </summary>
public sealed class SlotBookedHandler(
    IDistributedCache cache,
    DaprClient dapr,
    ILogger<SlotBookedHandler> logger)
    : INotificationHandler<DomainEventNotification<SlotBooked>>
{
    public async Task Handle(
        DomainEventNotification<SlotBooked> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        // 1. Evict stale slot-availability cache keys
        try
        {
            await cache.RemoveAsync("healthq:scheduling:stats", ct);
            await cache.RemoveAsync($"healthq:scheduling:slots:{evt.SlotId}", ct);
        }
        catch (Exception ex)
        {
            // Non-critical: log and continue — cache is a read-through optimisation
            logger.LogWarning(ex, "Failed to evict slot cache for SlotId={SlotId}", evt.SlotId);
        }

        // 2. Publish integration event to Dapr pub/sub → AI Agent Service picks it up
        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "slot.booked",
            data: new
            {
                SlotId = evt.SlotId,
                PatientId = evt.PatientId,
                PractitionerId = evt.PractitionerId,
                AppointmentTime = evt.AppointmentTime,
                OccurredAt = evt.OccurredAt,
            },
            cancellationToken: ct);

        logger.LogInformation(
            "SlotBooked event processed: SlotId={SlotId}, PatientId={PatientId}",
            evt.SlotId, evt.PatientId);
    }
}
