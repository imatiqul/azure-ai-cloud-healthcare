using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Endpoints;

public static class AgentEndpoints
{
    public static IEndpointRouteBuilder MapAgentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents")
            .WithTags("Agents")
            .WithAutoValidation();

        group.MapPost("/triage", async (
            StartTriageRequest request,
            TriageOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var workflow = await orchestrator.RunTriageAsync(request.SessionId, request.TranscriptText, ct);
            return Results.Created($"/api/v1/agents/triage/{workflow.Id}",
                new { workflow.Id, Status = workflow.Status.ToString(), AssignedLevel = workflow.AssignedLevel?.ToString(), workflow.AgentReasoning });
        });

        group.MapGet("/triage/{id:guid}", async (
            Guid id,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows
                .FirstOrDefaultAsync(w => w.Id == id, ct);
            return workflow is null ? Results.NotFound() : Results.Ok(workflow);
        });

        group.MapPost("/triage/{id:guid}/approve", async (
            Guid id,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();
            workflow.ApproveEscalation();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { workflow.Id, Status = workflow.Status.ToString(), AssignedLevel = workflow.AssignedLevel?.ToString() });
        });

        group.MapGet("/triage", async (
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflows = await db.TriageWorkflows
                .OrderByDescending(w => w.CreatedAt)
                .Take(50)
                .Select(w => new { w.Id, w.SessionId, Status = w.Status.ToString(), AssignedLevel = w.AssignedLevel != null ? w.AssignedLevel.ToString() : null, w.AgentReasoning, w.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(workflows);
        });

        group.MapGet("/decisions/{workflowId:guid}", async (
            Guid workflowId,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var decisions = await db.AgentDecisions
                .Where(d => d.WorkflowId == workflowId)
                .OrderBy(d => d.CreatedAt)
                .ToListAsync(ct);
            return Results.Ok(decisions);
        });

        group.MapGet("/stats", async (
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var pending = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.Pending || w.Status == WorkflowStatus.Processing, ct);
            var awaitingReview = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.AwaitingHumanReview, ct);
            var completed = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.Completed, ct);
            return Results.Ok(new { pendingTriage = pending, awaitingReview, completed });
        });

        return app;
    }
}

public record StartTriageRequest(Guid SessionId, string TranscriptText);
