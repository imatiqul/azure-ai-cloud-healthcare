using Dapr;
using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Notifications.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace HealthQCopilot.Notifications.Controllers;

[ApiController]
public class NotificationsSubscriberController : ControllerBase
{
    private readonly NotificationDbContext _db;
    private readonly ILogger<NotificationsSubscriberController> _logger;

    public NotificationsSubscriberController(NotificationDbContext db,
        ILogger<NotificationsSubscriberController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// When a P1/P2 escalation is required, create and activate an outreach campaign.
    /// </summary>
    [Topic("pubsub", "escalation.required")]
    [HttpPost("/dapr/sub/escalation-required")]
    public async Task<IActionResult> HandleEscalationRequired(
        [FromBody] EscalationEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Received escalation.required for workflow {WorkflowId} level {Level}",
            payload.WorkflowId, payload.Level);

        var campaign = OutreachCampaign.Create(
            Guid.NewGuid(),
            $"URGENT: {payload.Level} Escalation — {payload.WorkflowId.ToString()[..8]}",
            CampaignType.Custom,
            payload.WorkflowId.ToString());

        campaign.Activate(DateTime.UtcNow);

        // Create a placeholder message — RecipientAddress must be resolved from Identity service
        // when patient contact info is available
        var message = Message.Create(campaign.Id, payload.WorkflowId.ToString(),
            MessageChannel.Email,
            $"URGENT escalation alert: Triage level {payload.Level} for workflow {payload.WorkflowId}.",
            recipientAddress: null);

        _db.OutreachCampaigns.Add(campaign);
        _db.Messages.Add(message);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Escalation campaign {CampaignId} created for workflow {WorkflowId}",
            campaign.Id, payload.WorkflowId);

        return Ok();
    }

    /// <summary>
    /// When a slot is booked, notify the patient of their appointment.
    /// </summary>
    [Topic("pubsub", "scheduling.slot.booked")]
    [HttpPost("/dapr/sub/slot-booked")]
    public async Task<IActionResult> HandleSlotBooked(
        [FromBody] SlotBookedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Received scheduling.slot.booked for booking {BookingId}", payload.BookingId);

        var campaign = OutreachCampaign.Create(
            Guid.NewGuid(),
            $"Appointment Confirmation — {payload.PatientId[..Math.Min(8, payload.PatientId.Length)]}",
            CampaignType.Reminder,
            payload.PatientId);

        campaign.Activate(DateTime.UtcNow);

        var message = Message.Create(campaign.Id, payload.PatientId,
            MessageChannel.Email,
            $"Your appointment with {payload.PractitionerId} is confirmed for " +
            $"{payload.AppointmentTime:dddd, MMMM d 'at' h:mm tt} UTC.",
            recipientAddress: null);  // Resolved from Identity service when available

        _db.OutreachCampaigns.Add(campaign);
        _db.Messages.Add(message);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Appointment notification campaign {CampaignId} created for patient {PatientId}",
            campaign.Id, payload.PatientId);

        return Ok();
    }
}

public record EscalationEvent(Guid WorkflowId, string SessionId, string? Level);
public record SlotBookedEvent(Guid BookingId, Guid SlotId, string PatientId, string PractitionerId, DateTime AppointmentTime);
