using System.Net.Http.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Sagas;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.Messaging;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// Dispatches cross-service workflow events via HTTP after triage completes.
/// Calls downstream services (Revenue, Notifications, Scheduling) through the APIM gateway.
/// </summary>
public sealed class WorkflowDispatcher : IWorkflowDispatcher
{
    private readonly HttpClient _http;
    private readonly ILogger<WorkflowDispatcher> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEventHubAuditService? _audit;

    public WorkflowDispatcher(
        HttpClient http,
        ILogger<WorkflowDispatcher> logger,
        IServiceScopeFactory scopeFactory,
        IEventHubAuditService? audit = null)
    {
        _http = http;
        _logger = logger;
        _scopeFactory = scopeFactory;
        _audit = audit;
    }

    public async Task DispatchAsync(TriageWorkflow workflow, string patientId, CancellationToken ct)
    {
        // W1.5 — record which targets were attempted so the audit log links the
        // AI triage decision to the cross-service dispatch chain (HIPAA § 164.312(b)).
        var targets = new List<string>(4) { "revenue", "fhir" };

        await DispatchRevenueCodingJobAsync(workflow, patientId, ct);
        await DispatchFhirEncounterAsync(workflow, patientId, ct);

        if (workflow.AssignedLevel is TriageLevel.P1_Immediate or TriageLevel.P2_Urgent)
        {
            targets.Add("escalation_notification");
            await DispatchEscalationNotificationAsync(workflow, ct);
        }
        else
        {
            targets.Add("auto_schedule");
            await DispatchAutoScheduleAsync(workflow, ct);
        }

        if (_audit is not null)
        {
            try
            {
                await _audit.PublishAsync(
                    AuditEvent.WorkflowDispatched(
                        workflow.SessionId,
                        workflow.Id,
                        workflow.AssignedLevel?.ToString() ?? "Unknown",
                        targets),
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "WorkflowDispatched audit publish failed for session {SessionId}", workflow.SessionId);
            }
        }
    }

    /// <summary>Retries a failed encounter dispatch for an existing workflow.</summary>
    public Task RetryEncounterDispatchAsync(TriageWorkflow workflow, CancellationToken ct)
        => DispatchFhirEncounterAsync(workflow, workflow.PatientId, ct);

    /// <summary>Retries a failed revenue coding dispatch for an existing workflow.</summary>
    public Task RetryRevenueDispatchAsync(TriageWorkflow workflow, CancellationToken ct)
        => DispatchRevenueCodingJobAsync(workflow, workflow.PatientId, ct);

    /// <summary>Retries a failed notification dispatch — booking confirmation if booked, otherwise escalation alert.</summary>
    public Task RetryNotificationAsync(TriageWorkflow workflow, CancellationToken ct)
        => workflow.BookingId is not null
            ? DispatchBookingConfirmationAsync(workflow.Id, workflow.PatientId, workflow.BookingId, ct)
            : DispatchEscalationNotificationAsync(workflow, ct);

    /// <summary>Triggers auto-scheduling for a workflow after approval or explicit requeue.</summary>
    public Task DispatchPostApprovalAsync(TriageWorkflow workflow, CancellationToken ct)
        => DispatchAutoScheduleAsync(workflow, ct);

    /// <summary>Re-runs auto-scheduling for a workflow whose scheduling step failed or was waitlisted.</summary>
    public Task RetrySchedulingAsync(TriageWorkflow workflow, CancellationToken ct)
        => DispatchAutoScheduleAsync(workflow, ct);

    public async Task DispatchBookingConfirmationAsync(Guid workflowId, string patientId, string? bookingId, CancellationToken ct)
    {
        await UpdateWorkflowAsync(workflowId, workflow => workflow.BeginNotificationDispatch(), ct);
        try
        {
            var campaignPayload = new
            {
                Name = $"Appointment confirmation {(bookingId ?? workflowId.ToString()[..8])}",
                Type = 3,
                TargetPatientIds = new[] { patientId },
            };

            var campaignResp = await _http.PostAsJsonAsync("/api/v1/notifications/campaigns", campaignPayload, ct);
            if (!campaignResp.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflowId,
                    workflow => workflow.FailNotificationDispatch($"Booking confirmation campaign failed with {(int)campaignResp.StatusCode}."), ct);
                return;
            }

            var created = await campaignResp.Content.ReadFromJsonAsync<CampaignCreatedResult>(cancellationToken: ct);
            if (created?.Id is null)
            {
                await UpdateWorkflowAsync(workflowId,
                    workflow => workflow.FailNotificationDispatch("Booking confirmation campaign returned no identifier."), ct);
                return;
            }

            var activateResp = await _http.PostAsync($"/api/v1/notifications/campaigns/{created.Id}/activate", null, ct);
            if (!activateResp.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflowId,
                    workflow => workflow.FailNotificationDispatch($"Booking confirmation activation failed with {(int)activateResp.StatusCode}."), ct);
                return;
            }

            await UpdateWorkflowAsync(workflowId, workflow => workflow.CompleteNotificationDispatch(), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch booking confirmation for workflow {WorkflowId}", workflowId);
            await UpdateWorkflowAsync(workflowId,
                workflow => workflow.FailNotificationDispatch("Booking confirmation dispatch failed."), ct);
        }
    }

    private async Task DispatchRevenueCodingJobAsync(TriageWorkflow workflow, string patientId, CancellationToken ct)
    {
        await UpdateWorkflowAsync(workflow.Id, current => current.BeginRevenueDispatch(), ct);
        try
        {
            var payload = new
            {
                SessionId = workflow.SessionId,
                PatientId = patientId,
                TriageLevel = workflow.AssignedLevel?.ToString() ?? "P3_Standard",
                TriageReasoning = workflow.AgentReasoning ?? string.Empty
            };

            var response = await _http.PostAsJsonAsync("/api/v1/revenue/coding-jobs/from-triage", payload, ct);

            if (response.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflow.Id, current => current.CompleteRevenueDispatch(), ct);
                _logger.LogInformation("Revenue coding job created for session {SessionId}", workflow.SessionId);
            }
            else
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailRevenueDispatch($"Revenue coding dispatch returned {(int)response.StatusCode}."), ct);
                _logger.LogWarning("Revenue service returned {Status} for session {SessionId}", response.StatusCode, workflow.SessionId);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch revenue coding job for session {SessionId}", workflow.SessionId);
            await UpdateWorkflowAsync(workflow.Id,
                current => current.FailRevenueDispatch("Revenue coding dispatch failed."), ct);
        }
    }

    private async Task DispatchAutoScheduleAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        await UpdateWorkflowAsync(workflow.Id, current => current.BeginScheduling(), ct);
        try
        {
            if (!Guid.TryParse(workflow.PatientId, out var patientId))
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailScheduling("Auto-booking skipped because the workflow does not have a valid patient identifier."), ct);
                _logger.LogWarning("Skipping auto-scheduling for workflow {WorkflowId}: invalid patient id {PatientId}",
                    workflow.Id, workflow.PatientId);
                return;
            }

            // Find the first available slot and book it for the session patient
            var slotsResp = await _http.GetAsync("/api/v1/scheduling/slots?date=" + DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd"), ct);
            if (!slotsResp.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailScheduling($"Slot lookup returned {(int)slotsResp.StatusCode}."), ct);
                _logger.LogWarning("Scheduling service returned {Status} when fetching slots for session {SessionId}",
                    slotsResp.StatusCode, workflow.SessionId);
                return;
            }

            var slots = await slotsResp.Content.ReadFromJsonAsync<List<AvailableSlotResult>>(cancellationToken: ct);
            var slot = slots?.FirstOrDefault();
            if (slot is null)
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.MarkWaitlistFallback(null, "No scheduling slots were available for auto-booking."), ct);
                _logger.LogInformation("No available slots found for session {SessionId}", workflow.SessionId);
                return;
            }

            var bookingPayload = new
            {
                SlotId = slot.Id,
                PatientId = patientId,
                PractitionerId = slot.PractitionerId
            };

            // Delegate to BookingOrchestrationSaga — handles reserve, book, FHIR Appointment,
            // notification, and automatic compensation on partial failure.
            await UpdateWorkflowAsync(workflow.Id,
                current => current.BeginScheduling(slot.Id.ToString(), slot.PractitionerId), ct);

            using var scope = _scopeFactory.CreateScope();
            var saga = scope.ServiceProvider.GetRequiredService<BookingOrchestrationSaga>();
            var result = await saga.ExecuteAsync(
                workflow.Id, workflow.PatientId, slot.Id, slot.PractitionerId, slot.StartTime, ct);

            if (result.IsSuccess)
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.MarkBooked(result.BookingId?.ToString(), slot.Id.ToString(), slot.PractitionerId), ct);
                _logger.LogInformation("Auto-scheduled slot {SlotId} for session {SessionId} via saga", slot.Id, workflow.SessionId);
            }
            else
            {
                var compensationMsg = result.WasCompensated ? " (compensated)" : " (no compensation)";
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailScheduling($"Saga failed at {result.FailedStep}: {result.Error}{compensationMsg}"), ct);
                _logger.LogWarning("Booking saga failed at step {Step} for session {SessionId}: {Error}",
                    result.FailedStep, workflow.SessionId, result.Error);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to auto-schedule for session {SessionId}", workflow.SessionId);
            await UpdateWorkflowAsync(workflow.Id,
                current => current.FailScheduling("Auto-booking failed."), ct);
        }
    }

    private async Task DispatchEscalationNotificationAsync(TriageWorkflow workflow, CancellationToken ct)
    {
        await UpdateWorkflowAsync(workflow.Id, current => current.BeginNotificationDispatch(), ct);
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
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailNotificationDispatch($"Escalation campaign creation returned {(int)campaignResp.StatusCode}."), ct);
                _logger.LogWarning("Notification service returned {Status} creating campaign for session {SessionId}",
                    campaignResp.StatusCode, workflow.SessionId);
                return;
            }

            var created = await campaignResp.Content.ReadFromJsonAsync<CampaignCreatedResult>(cancellationToken: ct);
            if (created?.Id is null)
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailNotificationDispatch("Escalation campaign response returned no identifier."), ct);
                return;
            }

            var activateResp = await _http.PostAsync($"/api/v1/notifications/campaigns/{created.Id}/activate", null, ct);
            if (activateResp.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflow.Id, current => current.CompleteNotificationDispatch(), ct);
                _logger.LogInformation("Escalation campaign {CampaignId} activated for session {SessionId}",
                    created.Id, workflow.SessionId);
            }
            else
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailNotificationDispatch($"Escalation activation returned {(int)activateResp.StatusCode}."), ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch escalation notification for session {SessionId}", workflow.SessionId);
            await UpdateWorkflowAsync(workflow.Id,
                current => current.FailNotificationDispatch("Escalation notification dispatch failed."), ct);
        }
    }

    private async Task DispatchFhirEncounterAsync(TriageWorkflow workflow, string patientId, CancellationToken ct)
    {
        await UpdateWorkflowAsync(workflow.Id, current => current.BeginEncounterDispatch(), ct);
        try
        {
            var classCode = workflow.AssignedLevel is TriageLevel.P1_Immediate or TriageLevel.P2_Urgent
                ? "EMER" : "AMB";
            var subjectRef = patientId.StartsWith("Patient/") ? patientId : $"Patient/{patientId}";
            var fhirEncounter = new
            {
                resourceType = "Encounter",
                status = "in-progress",
                @class = new { code = classCode },
                subject = new { reference = subjectRef },
                period = new { start = DateTime.UtcNow.ToString("o") },
                reasonCode = new[]
                {
                    new { text = $"AI Triage: {workflow.AssignedLevel} — {workflow.AgentReasoning}" }
                }
            };

            var response = await _http.PostAsJsonAsync("/api/v1/fhir/encounters", fhirEncounter, ct);
            if (response.IsSuccessStatusCode)
            {
                await UpdateWorkflowAsync(workflow.Id, current => current.CompleteEncounterDispatch(), ct);
                _logger.LogInformation("FHIR encounter created for session {SessionId} patient {PatientId}",
                    workflow.SessionId, patientId);
            }
            else
            {
                await UpdateWorkflowAsync(workflow.Id,
                    current => current.FailEncounterDispatch($"FHIR encounter creation returned {(int)response.StatusCode}."), ct);
                _logger.LogWarning("FHIR service returned {Status} when creating encounter for session {SessionId}",
                    response.StatusCode, workflow.SessionId);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to create FHIR encounter for session {SessionId}", workflow.SessionId);
            await UpdateWorkflowAsync(workflow.Id,
                current => current.FailEncounterDispatch("FHIR encounter creation failed."), ct);
        }
    }

    private async Task UpdateWorkflowAsync(Guid workflowId, Action<TriageWorkflow> apply, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AgentDbContext>();
        var workflow = await db.TriageWorkflows.FirstOrDefaultAsync(item => item.Id == workflowId, ct);
        if (workflow is null) return;
        apply(workflow);
        await db.SaveChangesAsync(ct);
    }

    private sealed record CampaignCreatedResult(Guid? Id, string? Status);
    private sealed record BookingCreatedResult(Guid? Id, string? Status);
    private sealed record AvailableSlotResult(Guid Id, string PractitionerId, DateTime StartTime, DateTime EndTime, string Status);
}
