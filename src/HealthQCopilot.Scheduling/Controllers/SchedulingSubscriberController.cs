using Dapr;
using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Scheduling.Controllers;

[ApiController]
public class SchedulingSubscriberController : ControllerBase
{
    private readonly SchedulingDbContext _db;
    private readonly ILogger<SchedulingSubscriberController> _logger;

    public SchedulingSubscriberController(SchedulingDbContext db, ILogger<SchedulingSubscriberController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// When a P3/P4 triage completes, auto-find the next available slot and book it.
    /// P1/P2 escalations are handled by the WorkflowDispatcher HTTP path.
    /// </summary>
    [Topic("pubsub", "triage.completed")]
    [HttpPost("/dapr/sub/triage-completed")]
    public async Task<IActionResult> HandleTriageCompleted(
        [FromBody] TriageCompletedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Received triage.completed for workflow {WorkflowId} level {Level}",
            payload.WorkflowId, payload.Level);

        var slot = await _db.Slots
            .Where(s => s.Status == SlotStatus.Available && s.StartTime > DateTime.UtcNow)
            .OrderBy(s => s.StartTime)
            .FirstOrDefaultAsync(ct);

        if (slot is null)
        {
            _logger.LogWarning("No available slots for auto-booking after triage {WorkflowId}", payload.WorkflowId);
            return Ok(); // Acknowledge — don't retry, no slot available
        }

        var reserveResult = slot.Reserve(payload.WorkflowId.ToString());
        if (!reserveResult.IsSuccess)
        {
            _logger.LogWarning("Could not reserve slot {SlotId}: {Error}", slot.Id, reserveResult.Error);
            return Ok();
        }

        var bookResult = slot.Book();
        if (!bookResult.IsSuccess)
        {
            _logger.LogWarning("Could not book slot {SlotId}: {Error}", slot.Id, bookResult.Error);
            return Ok();
        }

        var booking = Booking.Create(slot.Id, payload.WorkflowId.ToString(), slot.PractitionerId, slot.StartTime);
        _db.Bookings.Add(booking);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Auto-booked slot {SlotId} → booking {BookingId} for workflow {WorkflowId}",
            slot.Id, booking.Id, payload.WorkflowId);

        return Ok();
    }
}

public record TriageCompletedEvent(Guid WorkflowId, string SessionId, string? Level, string? Reasoning);
