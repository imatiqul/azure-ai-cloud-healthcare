using Dapr.Client;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.PopulationHealth.EventHandlers;

/// <summary>
/// Handles CareGapIdentified domain event.
///
/// A care gap represents a missed preventive or chronic care measure (HEDIS/MIPS).
/// When identified, it must be surfaced to:
///   - Notification Service → trigger a patient outreach campaign
///   - FHIR Service → create a FHIR Task resource for the care team
/// Publishes to Dapr topic "care-gap.identified".
/// </summary>
public sealed class CareGapIdentifiedHandler(
    DaprClient dapr,
    ILogger<CareGapIdentifiedHandler> logger)
    : INotificationHandler<DomainEventNotification<CareGapIdentified>>
{
    public async Task Handle(
        DomainEventNotification<CareGapIdentified> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "care-gap.identified",
            data: new
            {
                CareGapId = evt.CareGapId,
                PatientId = evt.PatientId,
                MeasureId = evt.MeasureId,
                Description = evt.Description,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "PopHealth: Care gap identified — Patient={PatientId} Measure={MeasureId} Gap={CareGapId}",
            evt.PatientId, evt.MeasureId, evt.CareGapId);
    }
}

/// <summary>
/// Handles CareGapAddressed domain event.
/// A clinician has taken action on the gap (e.g. ordered the missing screening).
/// Publishes to "care-gap.addressed" so outreach campaigns can be suppressed.
/// </summary>
public sealed class CareGapAddressedHandler(
    DaprClient dapr,
    ILogger<CareGapAddressedHandler> logger)
    : INotificationHandler<DomainEventNotification<CareGapAddressed>>
{
    public async Task Handle(
        DomainEventNotification<CareGapAddressed> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "care-gap.addressed",
            data: new
            {
                CareGapId = evt.CareGapId,
                PatientId = evt.PatientId,
                MeasureId = evt.MeasureId,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "PopHealth: Care gap addressed — Patient={PatientId} Measure={MeasureId}",
            evt.PatientId, evt.MeasureId);
    }
}

/// <summary>
/// Handles CareGapClosed domain event.
/// The measure has been satisfied (e.g. screening result received).
/// Publishes to "care-gap.closed" to update HEDIS/MIPS quality scores.
/// </summary>
public sealed class CareGapClosedHandler(
    DaprClient dapr,
    ILogger<CareGapClosedHandler> logger)
    : INotificationHandler<DomainEventNotification<CareGapClosed>>
{
    public async Task Handle(
        DomainEventNotification<CareGapClosed> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "care-gap.closed",
            data: new
            {
                CareGapId = evt.CareGapId,
                PatientId = evt.PatientId,
                MeasureId = evt.MeasureId,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "PopHealth: Care gap closed — Patient={PatientId} Measure={MeasureId} (quality score updated)",
            evt.PatientId, evt.MeasureId);
    }
}
