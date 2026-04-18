using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Scheduling.Events;

namespace HealthQCopilot.Domain.Scheduling;

public enum BookingStatus { Confirmed, Cancelled }

public class Booking : AggregateRoot<Guid>
{
    public Guid SlotId { get; private set; }
    public string PatientId { get; private set; } = string.Empty;
    public string PractitionerId { get; private set; } = string.Empty;
    public DateTime AppointmentTime { get; private set; }
    public BookingStatus Status { get; private set; } = BookingStatus.Confirmed;
    public string? FhirAppointmentId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? CancelledAt { get; private set; }

    private Booking() { }

    public static Booking Create(Guid slotId, string patientId, string practitionerId, DateTime appointmentTime)
    {
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            SlotId = slotId,
            PatientId = patientId,
            PractitionerId = practitionerId,
            AppointmentTime = appointmentTime,
            Status = BookingStatus.Confirmed,
            CreatedAt = DateTime.UtcNow
        };
        booking.RaiseDomainEvent(new BookingCreated(booking.Id, slotId, patientId, practitionerId, appointmentTime));
        return booking;
    }

    public Result Cancel()
    {
        if (Status == BookingStatus.Cancelled)
            return Result.Failure("Booking is already cancelled");

        Status = BookingStatus.Cancelled;
        CancelledAt = DateTime.UtcNow;
        return Result.Success();
    }

    public void LinkFhirAppointment(string fhirAppointmentId) =>
        FhirAppointmentId = fhirAppointmentId;
}
