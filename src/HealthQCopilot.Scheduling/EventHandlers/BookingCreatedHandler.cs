using Dapr.Client;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Scheduling.Events;
using MediatR;

namespace HealthQCopilot.Scheduling.EventHandlers;

/// <summary>
/// Handles the BookingCreated domain event raised when a new Booking aggregate
/// is persisted (after the Slot is booked).
///
/// Publishes an integration event to the "booking.created" pub/sub topic.
/// Subscribers:
///   - AI Agent Service  → links booking to TriageWorkflow, marks scheduling step ✅
///   - Notification Service → sends booking confirmation to the patient
/// </summary>
public sealed class BookingCreatedHandler(
    DaprClient dapr,
    ILogger<BookingCreatedHandler> logger)
    : INotificationHandler<DomainEventNotification<BookingCreated>>
{
    public async Task Handle(
        DomainEventNotification<BookingCreated> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "booking.created",
            data: new
            {
                BookingId = evt.BookingId,
                SlotId = evt.SlotId,
                PatientId = evt.PatientId,
                PractitionerId = evt.PractitionerId,
                AppointmentTime = evt.AppointmentTime,
                OccurredAt = evt.OccurredAt,
            },
            cancellationToken: ct);

        logger.LogInformation(
            "BookingCreated integration event published: BookingId={BookingId}, PatientId={PatientId}",
            evt.BookingId, evt.PatientId);
    }
}
