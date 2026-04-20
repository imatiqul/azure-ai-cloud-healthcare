using Dapr;
using Dapr.Client;
using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Notifications.Infrastructure;
using HealthQCopilot.Notifications.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Notifications.Controllers;

/// <summary>
/// Dapr subscriber that handles scheduling.slot.booked events and schedules
/// appointment reminder notifications for T-24h and T-1h before the appointment.
///
/// Also handles delivery-status webhook callbacks from ACS and web-push
/// to update message delivery state in the database.
/// </summary>
[ApiController]
public sealed class AppointmentReminderController(
    NotificationDbContext db,
    ILogger<AppointmentReminderController> logger) : ControllerBase
{
    // ── Dapr subscriber: scheduling.slot.booked ──────────────────────────────

    [HttpPost("pubsub/booking-confirmed")]
    [Topic("pubsub", "scheduling.slot.booked")]
    public async Task<IActionResult> OnBookingConfirmed(
        [FromBody] BookingConfirmedEvent @event,
        CancellationToken ct)
    {
        logger.LogInformation(
            "Received booking {BookingId} for patient {PatientId} at {AppointmentTime}",
            @event.BookingId, @event.PatientId, @event.AppointmentTime);

        // Schedule T-24h and T-1h reminders by publishing delayed Dapr events.
        // In production this should use Dapr Workflow or Azure Scheduler for
        // reliable delay; here we create reminder message records that
        // CampaignDispatchService will pick up and send at the appropriate time.
        var appointmentUtc = @event.AppointmentTime.ToUniversalTime();
        var now = DateTime.UtcNow;

        await CreateReminderMessageAsync(
            @event, appointmentUtc, "24-hour", appointmentUtc.AddHours(-24), now, ct);

        await CreateReminderMessageAsync(
            @event, appointmentUtc, "1-hour", appointmentUtc.AddHours(-1), now, ct);

        return Ok();
    }

    private async Task CreateReminderMessageAsync(
        BookingConfirmedEvent @event,
        DateTime appointmentUtc,
        string window,
        DateTime scheduledFor,
        DateTime now,
        CancellationToken ct)
    {
        if (scheduledFor <= now)
        {
            logger.LogDebug("Skipping {Window} reminder for booking {Id} — scheduled time already passed",
                window, @event.BookingId);
            return;
        }

        // Find or create a system campaign for appointment reminders
        const string CampaignName = "appointment-reminders-system";
        var campaign = await db.OutreachCampaigns
            .FirstOrDefaultAsync(c => c.Name == CampaignName, ct);

        if (campaign is null)
        {
            campaign = OutreachCampaign.Create(Guid.NewGuid(), CampaignName,
                CampaignType.Reminder, @event.PatientId);
            campaign.Activate(now);
            db.OutreachCampaigns.Add(campaign);
        }

        var content =
            $"Reminder: Your appointment with {(string.IsNullOrWhiteSpace(@event.PractitionerId) ? "your provider" : @event.PractitionerId)} " +
            $"is scheduled for {appointmentUtc:f} UTC. " +
            $"Booking reference: {@event.BookingId}.";

        var message = Message.Create(
            campaign.Id,
            @event.PatientId,
            MessageChannel.Email,
            content,
            recipientAddress: null /* resolved by CampaignDispatchService */);

        db.Messages.Add(message);
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Queued {Window} appointment reminder message {MsgId} for patient {PatientId}",
            window, message.Id, @event.PatientId);
    }

    // ── Delivery status webhook (ACS / web-push provider callback) ───────────

    [HttpPost("/api/v1/notifications/webhook/delivery-status")]
    public async Task<IActionResult> DeliveryStatusWebhook(
        [FromBody] DeliveryStatusPayload payload,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(payload.MessageId))
            return BadRequest("messageId is required");

        if (!Guid.TryParse(payload.MessageId, out var msgId))
            return BadRequest("messageId must be a valid GUID");

        var message = await db.Messages.FindAsync([msgId], ct);
        if (message is null)
        {
            logger.LogWarning("Delivery callback for unknown message {Id}", msgId);
            return Ok(); // Idempotent — do not 404 to prevent retries
        }

        switch (payload.Status?.ToLowerInvariant())
        {
            case "delivered":
                message.MarkDelivered();
                break;
            case "failed":
            case "undeliverable":
                message.MarkFailed();
                logger.LogWarning("Message {Id} delivery failed: {Reason}", msgId, payload.FailureReason);
                break;
            default:
                logger.LogDebug("Ignoring delivery status '{Status}' for message {Id}", payload.Status, msgId);
                return Ok();
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Updated message {Id} status to {Status}", msgId, payload.Status);
        return Ok();
    }
}

// ── Event / payload DTOs ─────────────────────────────────────────────────────

public sealed record BookingConfirmedEvent(
    Guid BookingId,
    Guid SlotId,
    string PatientId,
    string PractitionerId,
    DateTime AppointmentTime);

public sealed record DeliveryStatusPayload(
    string MessageId,
    string Status,
    string? FailureReason = null);
