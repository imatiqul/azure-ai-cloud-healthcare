using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Scheduling;

/// <summary>
/// Waitlist entry for a patient awaiting an appointment slot with a specific practitioner.
/// When a matching slot becomes available the scheduler promotes the highest-priority entry.
/// Priority = lower number wins (1 = urgent).
/// </summary>
public class WaitlistEntry : AggregateRoot<Guid>
{
    public string PatientId { get; private set; } = string.Empty;
    public string PractitionerId { get; private set; } = string.Empty;
    /// <summary>Preferred appointment date window (inclusive, UTC).</summary>
    public DateOnly PreferredDateFrom { get; private set; }
    public DateOnly PreferredDateTo { get; private set; }
    public WaitlistStatus Status { get; private set; } = WaitlistStatus.Waiting;
    /// <summary>Clinical priority 1–5 (1 = urgent, 5 = routine). Lower number dequeues first.</summary>
    public int Priority { get; private set; } = 5;
    public string? Reason { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? PromotedAt { get; private set; }
    public Guid? PromotedToBookingId { get; private set; }

    private WaitlistEntry() { }

    public static WaitlistEntry Create(
        string patientId,
        string practitionerId,
        DateOnly preferredFrom,
        DateOnly preferredTo,
        int priority = 5,
        string? reason = null)
    {
        if (priority < 1 || priority > 5)
            throw new ArgumentOutOfRangeException(nameof(priority), "Priority must be 1–5");
        if (preferredTo < preferredFrom)
            throw new ArgumentException("preferredTo must be >= preferredFrom");

        return new WaitlistEntry
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            PractitionerId = practitionerId,
            PreferredDateFrom = preferredFrom,
            PreferredDateTo = preferredTo,
            Priority = priority,
            Reason = reason,
            Status = WaitlistStatus.Waiting,
            CreatedAt = DateTime.UtcNow,
        };
    }

    /// <summary>Mark as promoted when a matching slot was booked for this patient.</summary>
    public Result Promote(Guid bookingId)
    {
        if (Status != WaitlistStatus.Waiting)
            return Result.Failure($"Cannot promote entry in status {Status}");

        Status = WaitlistStatus.Promoted;
        PromotedAt = DateTime.UtcNow;
        PromotedToBookingId = bookingId;
        return Result.Success();
    }

    public Result Cancel()
    {
        if (Status != WaitlistStatus.Waiting)
            return Result.Failure("Only waiting entries can be cancelled");

        Status = WaitlistStatus.Cancelled;
        return Result.Success();
    }
}

public enum WaitlistStatus { Waiting, Promoted, Cancelled }
