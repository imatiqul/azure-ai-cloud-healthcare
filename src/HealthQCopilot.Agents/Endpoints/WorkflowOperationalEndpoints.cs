using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Endpoints;

public static class WorkflowOperationalEndpoints
{
    public static IEndpointRouteBuilder MapWorkflowOperationalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents/workflows")
            .WithTags("Agents")
            .WithAutoValidation();

        group.MapGet("/summary", async (
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflows = db.TriageWorkflows.AsNoTracking();
            var reviewDurations = await workflows
                .Where(item => item.ApprovedAt != null)
                .Select(item => new { item.CreatedAt, item.ApprovedAt })
                .ToListAsync(ct);

            var completedWorkflowCount = await workflows.CountAsync(item => item.Status == WorkflowStatus.Completed, ct);
            var automationCompleteCount = await workflows.CountAsync(item =>
                item.Status == WorkflowStatus.Completed
                && item.EncounterStatus == WorkflowStepStatus.Completed
                && item.RevenueStatus == WorkflowStepStatus.Completed,
                ct);

            return Results.Ok(new WorkflowSummaryMetricsResponse(
                Total: await workflows.CountAsync(ct),
                AwaitingHumanReview: await workflows.CountAsync(item => item.Status == WorkflowStatus.AwaitingHumanReview, ct),
                AttentionRequired: await workflows.CountAsync(item => item.RequiresAttention, ct),
                BookedToday: await workflows.CountAsync(item => item.BookedAt != null && item.BookedAt >= DateTime.UtcNow.Date, ct),
                WaitlistFallbacks: await workflows.CountAsync(item => item.WaitlistQueuedAt != null && item.WaitlistQueuedAt >= DateTime.UtcNow.Date.AddDays(-7), ct),
                ReviewOverdue: await workflows.CountAsync(item => item.Status == WorkflowStatus.AwaitingHumanReview && item.HumanReviewDueAt != null && item.HumanReviewDueAt < DateTime.UtcNow, ct),
                AverageReviewMinutes: reviewDurations.Count == 0
                    ? null
                    : Math.Round(reviewDurations.Average(item => (item.ApprovedAt!.Value - item.CreatedAt).TotalMinutes), 1),
                AutomationCompletionRate: completedWorkflowCount == 0
                    ? null
                    : Math.Round((double)automationCompleteCount / completedWorkflowCount, 3),
                AutoBooked: await workflows.CountAsync(item => item.BookedAt != null && item.ApprovedAt == null, ct),
                ManualBooked: await workflows.CountAsync(item => item.BookedAt != null && item.ApprovedAt != null, ct)
            ));
        });

        group.MapGet("/", async (
            AgentDbContext db,
            string? status,
            bool? attentionOnly,
            int? top,
            CancellationToken ct) =>
        {
            var query = db.TriageWorkflows.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<WorkflowStatus>(status, true, out var workflowStatus))
                query = query.Where(item => item.Status == workflowStatus);

            if (attentionOnly == true)
                query = query.Where(item => item.RequiresAttention);

            var take = Math.Clamp(top ?? 50, 1, 200);
            var workflows = await query
                .OrderByDescending(item => item.LastActivityAt)
                .Take(take)
                .ToListAsync(ct);

            var workflowIds = workflows.Select(item => item.Id).ToList();
            var escalations = workflowIds.Count == 0
                ? new Dictionary<Guid, EscalationQueueItem>()
                : await db.EscalationQueue.AsNoTracking()
                    .Where(item => workflowIds.Contains(item.WorkflowId))
                    .ToDictionaryAsync(item => item.WorkflowId, ct);

            return Results.Ok(workflows.Select(item =>
                ToWorkflowSummary(item, escalations.GetValueOrDefault(item.Id))));
        });

        group.MapGet("/{id:guid}", async (
            Guid id,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, ct);
            if (workflow is null) return Results.NotFound();

            var escalation = await db.EscalationQueue.AsNoTracking().FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            return Results.Ok(ToWorkflowSummary(workflow, escalation));
        });

        group.MapPost("/{id:guid}/reserve", async (
            Guid id,
            WorkflowReserveRequest request,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            workflow.UpdatePatientContext(request.PatientId ?? workflow.PatientId, request.PatientName);
            workflow.BeginScheduling(request.SlotId, request.PractitionerId);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToWorkflowSummary(workflow));
        });

        group.MapPost("/{id:guid}/book", async (
            Guid id,
            WorkflowBookRequest request,
            AgentDbContext db,
            WorkflowDispatcher dispatcher,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            workflow.UpdatePatientContext(request.PatientId, request.PatientName);
            workflow.MarkBooked(request.BookingId, request.SlotId, request.PractitionerId);
            await db.SaveChangesAsync(ct);

            _ = Task.Run(() => dispatcher.DispatchBookingConfirmationAsync(workflow.Id, workflow.PatientId, request.BookingId, CancellationToken.None), CancellationToken.None);
            return Results.Ok(ToWorkflowSummary(workflow));
        });

        group.MapPost("/{id:guid}/waitlist", async (
            Guid id,
            WorkflowWaitlistRequest request,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            workflow.UpdatePatientContext(request.PatientId, request.PatientName);
            workflow.MarkWaitlistFallback(request.PractitionerId,
                $"Patient was routed to waitlist with priority {(request.Priority ?? 3)}.");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToWorkflowSummary(workflow));
        });

        // ── Operator write actions ─────────────────────────────────────────────

        // Real-time negotiate — lets the workbench connect to the workflow-ops WebPubSub group
        group.MapGet("/realtime/negotiate", async (
            IWebPubSubService pubSub,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var userId = httpContext.User.Identity?.Name ?? "anonymous";
            var url = await pubSub.GetWorkflowOpsClientAccessUriAsync(userId, ct);
            return Results.Ok(new { url });
        });

        group.MapPost("/{id:guid}/approve", async (
            Guid id,
            WorkflowApproveRequest? request,
            AgentDbContext db,
            WorkflowDispatcher dispatcher,
            IWebPubSubService pubSub,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            workflow.ApproveEscalation(request?.ApprovedBy ?? "supervisor", request?.ApprovalNote);

            var escalation = await db.EscalationQueue.FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            if (escalation is not null && escalation.Status != EscalationStatus.Resolved)
                escalation.Resolve(request?.ApprovalNote ?? "Approved via workbench.");

            await db.SaveChangesAsync(ct);

            // Fire-and-forget scheduling dispatch now that escalation is cleared
            _ = Task.Run(() => dispatcher.DispatchPostApprovalAsync(workflow, CancellationToken.None), CancellationToken.None);

            var summary = ToWorkflowSummary(workflow, escalation);
            _ = Task.Run(() => pubSub.SendWorkflowUpdateAsync(new { type = "WorkflowUpdated", action = "Approved", workflow = summary }, CancellationToken.None), CancellationToken.None);
            return Results.Ok(summary);
        });

        group.MapPost("/{id:guid}/escalation/claim", async (
            Guid id,
            WorkflowEscalationClaimRequest request,
            AgentDbContext db,
            IWebPubSubService pubSub,
            CancellationToken ct) =>
        {
            var escalation = await db.EscalationQueue.FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            if (escalation is null) return Results.NotFound();

            try { escalation.Claim(request.ClaimedBy); }
            catch (InvalidOperationException ex) { return Results.Conflict(ex.Message); }

            await db.SaveChangesAsync(ct);

            var workflow = await db.TriageWorkflows.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, ct);
            if (workflow is null) return Results.NotFound();
            var summary = ToWorkflowSummary(workflow, escalation);
            _ = Task.Run(() => pubSub.SendWorkflowUpdateAsync(new { type = "WorkflowUpdated", action = "EscalationClaimed", workflow = summary }, CancellationToken.None), CancellationToken.None);
            return Results.Ok(summary);
        });

        group.MapPost("/{id:guid}/escalation/release", async (
            Guid id,
            AgentDbContext db,
            IWebPubSubService pubSub,
            CancellationToken ct) =>
        {
            var escalation = await db.EscalationQueue.FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            if (escalation is null) return Results.NotFound();

            try { escalation.Release(); }
            catch (InvalidOperationException ex) { return Results.Conflict(ex.Message); }

            await db.SaveChangesAsync(ct);

            var workflow = await db.TriageWorkflows.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, ct);
            if (workflow is null) return Results.NotFound();
            var summary = ToWorkflowSummary(workflow, escalation);
            _ = Task.Run(() => pubSub.SendWorkflowUpdateAsync(new { type = "WorkflowUpdated", action = "EscalationReleased", workflow = summary }, CancellationToken.None), CancellationToken.None);
            return Results.Ok(summary);
        });

        group.MapPost("/{id:guid}/retry/{step}", async (
            Guid id,
            string step,
            AgentDbContext db,
            WorkflowDispatcher dispatcher,
            IWebPubSubService pubSub,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            var action = step.ToLowerInvariant() switch
            {
                "encounter"    => "RetryEncounter",
                "revenue"      => "RetryRevenue",
                "notification" => "RetryNotification",
                "scheduling"   => "RetryScheduling",
                _              => null,
            };

            if (action is null)
                return Results.BadRequest($"Unknown step '{step}'. Valid steps: encounter, revenue, notification, scheduling.");

            switch (step.ToLowerInvariant())
            {
                case "encounter":
                    workflow.RetryEncounterDispatch();
                    await db.SaveChangesAsync(ct);
                    _ = Task.Run(() => dispatcher.RetryEncounterDispatchAsync(workflow, CancellationToken.None), CancellationToken.None);
                    break;
                case "revenue":
                    workflow.RetryRevenueDispatch();
                    await db.SaveChangesAsync(ct);
                    _ = Task.Run(() => dispatcher.RetryRevenueDispatchAsync(workflow, CancellationToken.None), CancellationToken.None);
                    break;
                case "notification":
                    workflow.RetryNotificationDispatch();
                    await db.SaveChangesAsync(ct);
                    _ = Task.Run(() => dispatcher.RetryNotificationAsync(workflow, CancellationToken.None), CancellationToken.None);
                    break;
                case "scheduling":
                    workflow.RequeueScheduling();
                    await db.SaveChangesAsync(ct);
                    _ = Task.Run(() => dispatcher.RetrySchedulingAsync(workflow, CancellationToken.None), CancellationToken.None);
                    break;
            }

            var escalation = await db.EscalationQueue.AsNoTracking().FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            var summary = ToWorkflowSummary(workflow, escalation);
            _ = Task.Run(() => pubSub.SendWorkflowUpdateAsync(new { type = "WorkflowUpdated", action, workflow = summary }, CancellationToken.None), CancellationToken.None);
            return Results.Ok(summary);
        });

        group.MapPost("/{id:guid}/requeue-scheduling", async (
            Guid id,
            AgentDbContext db,
            WorkflowDispatcher dispatcher,
            IWebPubSubService pubSub,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();

            workflow.RequeueScheduling();
            await db.SaveChangesAsync(ct);

            _ = Task.Run(() => dispatcher.RetrySchedulingAsync(workflow, CancellationToken.None), CancellationToken.None);

            var escalation = await db.EscalationQueue.AsNoTracking().FirstOrDefaultAsync(item => item.WorkflowId == id, ct);
            var summary = ToWorkflowSummary(workflow, escalation);
            _ = Task.Run(() => pubSub.SendWorkflowUpdateAsync(new { type = "WorkflowUpdated", action = "RequeueScheduling", workflow = summary }, CancellationToken.None), CancellationToken.None);
            return Results.Ok(summary);
        });

        return app;
    }

    public static WorkflowSummaryResponse ToWorkflowSummary(TriageWorkflow workflow, EscalationQueueItem? escalation = null)
        => new(
            Id: workflow.Id,
            SessionId: workflow.SessionId,
            PatientId: workflow.PatientId,
            PatientName: workflow.PatientName,
            Status: workflow.Status.ToString(),
            TriageLevel: workflow.AssignedLevel?.ToString(),
            AgentReasoning: workflow.AgentReasoning,
            CreatedAt: workflow.CreatedAt,
            CompletedAt: workflow.CompletedAt,
            LastActivityAt: workflow.LastActivityAt,
            ApprovedAt: workflow.ApprovedAt,
            ApprovedBy: workflow.ApprovedBy,
            HumanReviewDueAt: workflow.HumanReviewDueAt,
            ReviewOverdue: workflow.IsHumanReviewOverdue(DateTime.UtcNow),
            RequiresAttention: workflow.RequiresAttention,
            LatestExceptionCode: workflow.LatestExceptionCode,
            LatestExceptionMessage: workflow.LatestExceptionMessage,
            EncounterStatus: workflow.EncounterStatus.ToString(),
            RevenueStatus: workflow.RevenueStatus.ToString(),
            SchedulingStatus: workflow.SchedulingStatus.ToString(),
            NotificationStatus: workflow.NotificationStatus.ToString(),
            CurrentPractitionerId: workflow.CurrentPractitionerId,
            CurrentSlotId: workflow.CurrentSlotId,
            BookingId: workflow.BookingId,
            BookedAt: workflow.BookedAt,
            WaitlistQueuedAt: workflow.WaitlistQueuedAt,
            EscalationStatus: escalation?.Status.ToString(),
            EscalationAssignee: escalation?.ClaimedBy,
            EscalationClaimedAt: escalation?.ClaimedAt);
}

public sealed record WorkflowReserveRequest(string SlotId, string? PatientId, string? PractitionerId, string? PatientName = null);
public sealed record WorkflowBookRequest(string SlotId, string PatientId, string? PractitionerId, string? BookingId, string? PatientName = null);
public sealed record WorkflowWaitlistRequest(string PatientId, string? PractitionerId, int? Priority, string? PatientName = null);
public sealed record WorkflowApproveRequest(string? ApprovedBy, string? ApprovalNote);
public sealed record WorkflowEscalationClaimRequest(string ClaimedBy);

public sealed record WorkflowSummaryResponse(
    Guid Id,
    string SessionId,
    string PatientId,
    string? PatientName,
    string Status,
    string? TriageLevel,
    string? AgentReasoning,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    DateTime LastActivityAt,
    DateTime? ApprovedAt,
    string? ApprovedBy,
    DateTime? HumanReviewDueAt,
    bool ReviewOverdue,
    bool RequiresAttention,
    string? LatestExceptionCode,
    string? LatestExceptionMessage,
    string EncounterStatus,
    string RevenueStatus,
    string SchedulingStatus,
    string NotificationStatus,
    string? CurrentPractitionerId,
    string? CurrentSlotId,
    string? BookingId,
    DateTime? BookedAt,
    DateTime? WaitlistQueuedAt,
    string? EscalationStatus,
    string? EscalationAssignee,
    DateTime? EscalationClaimedAt);

public sealed record WorkflowSummaryMetricsResponse(
    int Total,
    int AwaitingHumanReview,
    int AttentionRequired,
    int BookedToday,
    int WaitlistFallbacks,
    int ReviewOverdue,
    double? AverageReviewMinutes,
    double? AutomationCompletionRate,
    int AutoBooked,
    int ManualBooked);