using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.Validation;

namespace HealthQCopilot.Agents.Endpoints;

public static class DemoEndpoints
{
    public static IEndpointRouteBuilder MapDemoEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents/demo")
            .WithTags("Demo")
            .WithAutoValidation();

        // Public endpoints — no auth required for self-service demo
        group.MapPost("/start", async (
            StartDemoRequest request,
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var result = await orchestrator.StartDemoAsync(request.ClientName, request.Company, request.Email, ct);
            return Results.Created($"/api/v1/agents/demo/{result.SessionId}/status", result);
        })
        .WithName("StartDemo")
        .WithSummary("Start a new interactive demo session (no auth required)");

        group.MapPost("/{id:guid}/next", async (
            Guid id,
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            try
            {
                var result = await orchestrator.AdvanceStepAsync(id, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        })
        .WithName("AdvanceDemoStep")
        .WithSummary("Advance to the next demo step");

        group.MapPost("/{id:guid}/feedback", async (
            Guid id,
            SubmitStepFeedbackRequest request,
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            try
            {
                if (!Enum.TryParse<DemoStep>(request.Step, true, out var step))
                    return Results.BadRequest("Invalid step name");

                await orchestrator.SubmitStepFeedbackAsync(id, step, request.Rating, request.Tags, request.Comment, ct);
                return Results.Ok(new { Message = "Feedback recorded" });
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        })
        .WithName("SubmitStepFeedback")
        .WithSummary("Submit feedback for a demo step");

        group.MapPost("/{id:guid}/complete", async (
            Guid id,
            CompleteDemoRequest request,
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            try
            {
                var result = await orchestrator.CompleteDemoAsync(id, request.NpsScore, request.FeaturePriorities, request.Comment, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        })
        .WithName("CompleteDemo")
        .WithSummary("Complete the demo with overall feedback");

        group.MapGet("/{id:guid}/status", async (
            Guid id,
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            try
            {
                var result = await orchestrator.GetStatusAsync(id, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        })
        .WithName("GetDemoStatus")
        .WithSummary("Get current demo session status and progress");

        // Admin endpoints — require auth
        var admin = app.MapGroup("/api/v1/agents/demo")
            .WithTags("Demo Admin");

        admin.MapGet("/sessions", async (
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var result = await orchestrator.GetSessionsAsync(ct);
            return Results.Ok(result);
        })
        .WithName("GetDemoSessions")
        .WithSummary("List all demo sessions (admin only)");

        admin.MapPost("/insights", async (
            DemoOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            try
            {
                var result = await orchestrator.GenerateInsightsAsync(ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { ex.Message });
            }
        })
        .WithName("GenerateDemoInsights")
        .WithSummary("Generate AI-aggregated insights from demo feedback (admin only)");

        return app;
    }
}

public record StartDemoRequest(string ClientName, string Company, string? Email);
public record SubmitStepFeedbackRequest(string Step, int Rating, List<string> Tags, string? Comment);
public record CompleteDemoRequest(int NpsScore, List<string> FeaturePriorities, string? Comment);
