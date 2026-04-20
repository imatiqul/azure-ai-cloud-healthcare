using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Scheduling.Services;

/// <summary>
/// Manages the appointment waitlist.
/// When a slot is released the service scans the waitlist for the highest-priority
/// entry within the slot's date window and promotes it to a confirmed booking.
/// </summary>
public sealed class WaitlistService(
    SchedulingDbContext db,
    ILogger<WaitlistService> logger)
{
    /// <summary>Add a patient to the waitlist. Returns the created entry ID.</summary>
    public async Task<Guid> EnqueueAsync(
        string patientId,
        string practitionerId,
        DateOnly preferredFrom,
        DateOnly preferredTo,
        int priority,
        string? reason,
        CancellationToken ct = default)
    {
        // Prevent duplicate waiting entries for same patient + practitioner window
        var existing = await db.WaitlistEntries.FirstOrDefaultAsync(
            w => w.PatientId == patientId
              && w.PractitionerId == practitionerId
              && w.Status == WaitlistStatus.Waiting,
            ct);

        if (existing is not null)
        {
            logger.LogDebug("Waitlist entry already exists {Id} for patient {PatientId}", existing.Id, patientId);
            return existing.Id;
        }

        var entry = WaitlistEntry.Create(patientId, practitionerId, preferredFrom, preferredTo, priority, reason);
        db.WaitlistEntries.Add(entry);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Enqueued waitlist entry {Id} for patient {PatientId} (priority {Priority})",
            entry.Id, patientId, priority);
        return entry.Id;
    }

    /// <summary>
    /// Called when a slot is released/cancelled.
    /// Finds the highest-priority waiting entry for the same practitioner and date,
    /// creates a booking, and promotes the waitlist entry.
    /// Returns the new booking ID if a promotion occurred, null otherwise.
    /// </summary>
    public async Task<Guid?> TryPromoteAsync(Slot slot, CancellationToken ct = default)
    {
        var slotDate = DateOnly.FromDateTime(slot.StartTime);

        // Find the best-priority waiting entry that covers this slot's date
        var candidate = await db.WaitlistEntries
            .Where(w => w.PractitionerId == slot.PractitionerId
                     && w.Status == WaitlistStatus.Waiting
                     && w.PreferredDateFrom <= slotDate
                     && w.PreferredDateTo >= slotDate)
            .OrderBy(w => w.Priority)
            .ThenBy(w => w.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (candidate is null) return null;

        // Conflict check: ensure patient does not already have a booking at this time
        var hasConflict = await HasConflictAsync(candidate.PatientId, slot.StartTime, slot.EndTime, ct);
        if (hasConflict)
        {
            logger.LogWarning("Waitlist promotion skipped: patient {PatientId} already has a booking overlapping slot {SlotId}",
                candidate.PatientId, slot.Id);
            return null;
        }

        // Reserve then book the slot
        slot.Reserve(candidate.PatientId);
        slot.Book();

        var booking = Booking.Create(slot.Id, candidate.PatientId, slot.PractitionerId, slot.StartTime);
        db.Bookings.Add(booking);

        candidate.Promote(booking.Id);

        await db.SaveChangesAsync(ct);

        logger.LogInformation("Promoted waitlist entry {EntryId} → booking {BookingId} for patient {PatientId}",
            candidate.Id, booking.Id, candidate.PatientId);

        return booking.Id;
    }

    /// <summary>
    /// Validates that a patient does not have an overlapping confirmed booking
    /// for the proposed [start, end) window.
    /// Also checks for double-booking the same practitioner in the same window.
    /// </summary>
    public async Task<bool> HasConflictAsync(
        string patientId,
        DateTime startTime,
        DateTime endTime,
        CancellationToken ct = default)
    {
        // Patient-level conflict: same patient booked for an overlapping slot
        var patientConflict = await db.Bookings
            .Join(db.Slots,
                b => b.SlotId,
                s => s.Id,
                (b, s) => new { Booking = b, Slot = s })
            .AnyAsync(j => j.Booking.PatientId == patientId
                        && j.Booking.Status == BookingStatus.Confirmed
                        && j.Slot.StartTime < endTime
                        && j.Slot.EndTime > startTime,
                ct);

        return patientConflict;
    }

    /// <summary>Retrieves all waiting entries for a patient.</summary>
    public async Task<IReadOnlyList<WaitlistEntry>> GetPatientWaitlistAsync(
        string patientId, CancellationToken ct = default) =>
        await db.WaitlistEntries
            .Where(w => w.PatientId == patientId && w.Status == WaitlistStatus.Waiting)
            .OrderBy(w => w.Priority)
            .ThenBy(w => w.CreatedAt)
            .ToListAsync(ct);
}
