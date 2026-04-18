using System.Net.Http.Json;
using HealthQCopilot.Domain.Agents;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// Dispatches cross-service workflow events via HTTP after triage completes.
/// Calls downstream services (Revenue, Notifications, Scheduling) through the APIM gateway.
/// </summary>
public sealed class WorkflowDispatcher
{
    private readonly HttpClient _http;
    private readonly ILogger<WorkflowDispatcher> _logger;

    public WorkflowDispatcher(HttpClient http, ILogger<WorkflowDispatcher> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task DispatchAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        var tasks = new List<Task>
        {
            DispatchRevenueCodingJobAsync(workflow, ct)
        };

        if (workflow.AssignedLevel is TriageLevel.P1_Immediate or TriageLevel.P2_Urgent)
        {
            tasks.Add(DispatchEscalationNotificationAsync(workflow, ct));
        }
        else
        {
            // For P3/P4, auto-schedule an appointment
            tasks.Add(DispatchAutoScheduleAsync(workflow, ct));
        }

        await Task.WhenAll(tasks);
    }

    private async Task DispatchRevenueCodingJobAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        try
        {
            var payload = new
            {
                SessionId = workflow.SessionId,
                TriageLevel = workflow.AssignedLevel?.ToString() ?? "P3_Standard",
                TriageReasoning = workflow.AgentReasoning ?? string.Empty
            };

            var response = await _http.PostAsJsonAsync("/api/v1/revenue/coding-jobs/from-triage", payload, ct);

            if (response.IsSuccessStatusCode)
                _logger.LogInformation("Revenue coding job created for session {SessionId}", workflow.SessionId);
            else
                _logger.LogWarning("Revenue service returned {Status} for session {SessionId}", response.StatusCode, workflow.SessionId);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch revenue coding job for session {SessionId}", workflow.SessionId);
        }
    }

    private async Task DispatchAutoScheduleAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        try
        {
            // Find the first available slot and book it for the session patient
            var slotsResp = await _http.GetAsync("/api/v1/scheduling/slots?date=" + DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd"), ct);
            if (!slotsResp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Scheduling service returned {Status} when fetching slots for session {SessionId}",
                    slotsResp.StatusCode, workflow.SessionId);
                return;
            }

            var slots = await slotsResp.Content.ReadFromJsonAsync<List<AvailableSlotResult>>(cancellationToken: ct);
            var slot = slots?.FirstOrDefault();
            if (slot is null)
            {
                _logger.LogInformation("No available slots found for session {SessionId}", workflow.SessionId);
                return;
            }

            var bookingPayload = new
            {
                SlotId = slot.Id,
                PatientId = workflow.SessionId,  // session GUID as patient identifier
                PractitionerId = slot.PractitionerId
            };

            // Reserve then book
            await _http.PostAsJsonAsync($"/api/v1/scheduling/slots/{slot.Id}/reserve",
                new { PatientId = workflow.SessionId }, ct);

            var bookingResp = await _http.PostAsJsonAsync("/api/v1/scheduling/bookings", bookingPayload, ct);
            if (bookingResp.IsSuccessStatusCode)
                _logger.LogInformation("Auto-scheduled slot {SlotId} for session {SessionId}", slot.Id, workflow.SessionId);
            else
                _logger.LogWarning("Auto-scheduling returned {Status} for session {SessionId}",
                    bookingResp.StatusCode, workflow.SessionId);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to auto-schedule for session {SessionId}", workflow.SessionId);
        }
    }

    private async Task DispatchEscalationNotificationAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        try
        {
            var campaignPayload = new
            {
                Name = $"URGENT: {workflow.AssignedLevel} Escalation - {workflow.SessionId[..8]}",
                Type = 3, // CampaignType.Custom
                TargetPatientIds = new[] { workflow.SessionId }
            };

            var campaignResp = await _http.PostAsJsonAsync("/api/v1/notifications/campaigns", campaignPayload, ct);
            if (!campaignResp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Notification service returned {Status} creating campaign for session {SessionId}",
                    campaignResp.StatusCode, workflow.SessionId);
                return;
            }

            var created = await campaignResp.Content.ReadFromJsonAsync<CampaignCreatedResult>(cancellationToken: ct);
            if (created?.Id is null) return;

            var activateResp = await _http.PostAsync($"/api/v1/notifications/campaigns/{created.Id}/activate", null, ct);
            if (activateResp.IsSuccessStatusCode)
            {
                _logger.LogInformation("Escalation campaign {CampaignId} activated for session {SessionId}",
                    created.Id, workflow.SessionId);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch escalation notification for session {SessionId}", workflow.SessionId);
        }
    }

    private sealed record CampaignCreatedResult(Guid? Id, string? Status);
    private sealed record AvailableSlotResult(Guid Id, string PractitionerId, DateTime StartTime, DateTime EndTime, string Status);
}
