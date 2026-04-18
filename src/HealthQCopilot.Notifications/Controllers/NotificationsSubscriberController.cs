using Dapr;
using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Notifications.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

        if (await IsFrequencyCappedAsync(payload.WorkflowId.ToString(), CampaignType.Custom, ct))
        {
            _logger.LogInformation("Frequency cap hit — skipping duplicate escalation campaign for workflow {WorkflowId}", payload.WorkflowId);
            return Ok();
        }

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

        if (await IsFrequencyCappedAsync(payload.PatientId, CampaignType.Reminder, ct))
        {
            _logger.LogInformation("Frequency cap hit — skipping duplicate appointment notification for patient {PatientId}", payload.PatientId);
            return Ok();
        }

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

    /// <summary>
    /// When prior auth is approved, notify the patient that their procedure is authorized.
    /// </summary>
    [Topic("pubsub", "revenue.prior-auth.approved")]
    [HttpPost("/dapr/sub/prior-auth-approved")]
    public async Task<IActionResult> HandlePriorAuthApproved(
        [FromBody] PriorAuthApprovedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Prior auth approved for patient {PatientId}: {Procedure}",
            payload.PatientId, payload.Procedure);

        if (await IsFrequencyCappedAsync(payload.PatientId, CampaignType.Custom, ct))
        {
            _logger.LogInformation("Frequency cap hit — skipping duplicate prior-auth approved notification for patient {PatientId}", payload.PatientId);
            return Ok();
        }

        var campaign = OutreachCampaign.Create(
            Guid.NewGuid(),
            $"Prior Authorization Approved — {payload.PatientId[..Math.Min(8, payload.PatientId.Length)]}",
            CampaignType.Custom,
            payload.PatientId);

        campaign.Activate(DateTime.UtcNow);

        var message = Message.Create(campaign.Id, payload.PatientId,
            MessageChannel.Email,
            $"Good news! Your prior authorization for {payload.Procedure} has been APPROVED" +
            (payload.InsurancePayer is not null ? $" by {payload.InsurancePayer}" : string.Empty) +
            ". Please contact your provider to schedule the procedure.",
            recipientAddress: null);

        _db.OutreachCampaigns.Add(campaign);
        _db.Messages.Add(message);
        await _db.SaveChangesAsync(ct);

        return Ok();
    }

    /// <summary>
    /// When prior auth is denied, notify the patient and suggest next steps.
    /// </summary>
    [Topic("pubsub", "revenue.prior-auth.denied")]
    [HttpPost("/dapr/sub/prior-auth-denied")]
    public async Task<IActionResult> HandlePriorAuthDenied(
        [FromBody] PriorAuthDeniedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Prior auth denied for patient {PatientId}: {Procedure} — {Reason}",
            payload.PatientId, payload.Procedure, payload.DenialReason);

        if (await IsFrequencyCappedAsync(payload.PatientId, CampaignType.Custom, ct))
        {
            _logger.LogInformation("Frequency cap hit — skipping duplicate prior-auth denied notification for patient {PatientId}", payload.PatientId);
            return Ok();
        }

        var campaign = OutreachCampaign.Create(
            Guid.NewGuid(),
            $"Prior Authorization Update — {payload.PatientId[..Math.Min(8, payload.PatientId.Length)]}",
            CampaignType.Custom,
            payload.PatientId);

        campaign.Activate(DateTime.UtcNow);

        var denialNote = string.IsNullOrWhiteSpace(payload.DenialReason)
            ? "no reason provided"
            : payload.DenialReason;

        var message = Message.Create(campaign.Id, payload.PatientId,
            MessageChannel.Email,
            $"Your prior authorization request for {payload.Procedure} has been reviewed. " +
            $"Unfortunately, it was not approved at this time ({denialNote}). " +
            "Please contact your provider to discuss alternative options or to appeal this decision.",
            recipientAddress: null);

        _db.OutreachCampaigns.Add(campaign);
        _db.Messages.Add(message);
        await _db.SaveChangesAsync(ct);

        return Ok();
    }

    // ── Frequency capping ─────────────────────────────────────────────────────
    // Prevents notification flooding: same patient+type capped at 1 per 4 hours.
    private const int FrequencyCapHours = 4;

    private async Task<bool> IsFrequencyCappedAsync(string targetId, CampaignType type, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddHours(-FrequencyCapHours);
        return await _db.OutreachCampaigns
            .AnyAsync(c => c.TargetCriteria == targetId
                        && c.Type == type
                        && c.CreatedAt >= cutoff, ct);
    }
}

public record EscalationEvent(Guid WorkflowId, string SessionId, string? Level);
public record SlotBookedEvent(Guid BookingId, Guid SlotId, string PatientId, string PractitionerId, DateTime AppointmentTime);
public record PriorAuthApprovedEvent(Guid Id, string PatientId, string PatientName, string Procedure, string? InsurancePayer, DateTime ResolvedAt);
public record PriorAuthDeniedEvent(Guid Id, string PatientId, string PatientName, string Procedure, string? InsurancePayer, string? DenialReason, DateTime ResolvedAt);
