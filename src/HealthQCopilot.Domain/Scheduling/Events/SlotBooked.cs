using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Scheduling.Events;

public sealed record SlotBooked(
    Guid SlotId,
    string PatientId,
    string PractitionerId,
    DateTime AppointmentTime) : DomainEvent;

public sealed record BookingCreated(
    Guid BookingId,
    Guid SlotId,
    string PatientId,
    string PractitionerId,
    DateTime AppointmentTime) : DomainEvent;
