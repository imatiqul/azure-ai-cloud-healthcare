using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Scheduling.Events;

namespace HealthQCopilot.Domain.Scheduling;

public enum SlotStatus { Available, Reserved, Booked, Cancelled }

public class Slot : AggregateRoot<Guid>
{
    public string PractitionerId { get; private set; } = string.Empty;
    public DateTime StartTime { get; private set; }
    public DateTime EndTime { get; private set; }
    public SlotStatus Status { get; private set; } = SlotStatus.Available;
    public string? ReservedByPatientId { get; private set; }
    public uint Version { get; private set; }

    private Slot() { }

    public static Slot Create(Guid id, string practitionerId, DateTime start, DateTime end)
    {
        return new Slot
        {
            Id = id,
            PractitionerId = practitionerId,
            StartTime = start,
            EndTime = end,
            Status = SlotStatus.Available
        };
    }

    public Result Reserve(string patientId)
    {
        if (Status != SlotStatus.Available)
            return Result.Failure("Slot is not available");

        Status = SlotStatus.Reserved;
        ReservedByPatientId = patientId;
        return Result.Success();
    }

    public Result Book()
    {
        if (Status != SlotStatus.Reserved)
            return Result.Failure("Slot must be reserved before booking");

        Status = SlotStatus.Booked;
        RaiseDomainEvent(new SlotBooked(Id, ReservedByPatientId!, PractitionerId, StartTime));
        return Result.Success();
    }

    public void Release()
    {
        Status = SlotStatus.Available;
        ReservedByPatientId = null;
    }

    public Result Cancel()
    {
        if (Status == SlotStatus.Cancelled)
            return Result.Failure("Slot is already cancelled");

        Status = SlotStatus.Cancelled;
        ReservedByPatientId = null;
        return Result.Success();
    }
}
