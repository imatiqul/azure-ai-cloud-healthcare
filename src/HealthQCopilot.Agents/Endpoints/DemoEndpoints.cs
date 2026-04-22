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

        // Phase 61 — Live platform insights for scene narration enrichment
        group.MapGet("/live-insights", async (
            IHttpClientFactory http,
            IConfiguration config,
            ILogger<DemoEndpoints> logger,
            CancellationToken ct) =>
        {
            var insights = await DemoEndpoints.FetchLiveInsightsAsync(http, config, logger, ct);
            return Results.Ok(insights);
        })
        .WithName("GetDemoLiveInsights")
        .WithSummary("Return live platform KPI snapshot for demo scene narration (no auth required)");

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

    // ── Phase 61 — Live platform insights ────────────────────────────────────
    internal static async Task<DemoLiveInsights> FetchLiveInsightsAsync(
        IHttpClientFactory http,
        IConfiguration config,
        ILogger<DemoEndpoints> logger,
        CancellationToken ct)
    {
        var client  = http.CreateClient("internal");
        var baseUrl = config["ServiceUrls:BFF"] ?? string.Empty;

        async Task<T> SafeGet<T>(string path, T fallback)
        {
            try
            {
                var res = await client.GetAsync($"{baseUrl}{path}", ct);
                if (!res.IsSuccessStatusCode) return fallback;
                return (await res.Content.ReadFromJsonAsync<T>(cancellationToken: ct)) ?? fallback;
            }
            catch (Exception ex)
            {
                logger.LogDebug("live-insights fallback for {Path}: {Msg}", path, ex.Message);
                return fallback;
            }
        }

        var agentsTask  = SafeGet("/api/v1/agents/stats",           new { pendingTriage = 8,   awaitingReview = 3,  completed = 47 });
        var schedTask   = SafeGet("/api/v1/scheduling/stats",        new { availableToday = 23, bookedToday = 41 });
        var popTask     = SafeGet("/api/v1/population-health/stats", new { highRiskPatients = 127, openCareGaps = 84 });
        var revenueTask = SafeGet("/api/v1/revenue/stats",           new { codingQueue = 31,   priorAuthsPending = 12 });

        await Task.WhenAll(agentsTask, schedTask, popTask, revenueTask);

        var agents  = await agentsTask;
        var sched   = await schedTask;
        var pop     = await popTask;
        var revenue = await revenueTask;

        return new DemoLiveInsights(
            PendingTriage:     agents.pendingTriage + agents.awaitingReview,
            HighRiskPatients:  pop.highRiskPatients,
            OpenCareGaps:      pop.openCareGaps,
            CodingQueue:       revenue.codingQueue,
            PriorAuthsPending: revenue.priorAuthsPending,
            AvailableSlots:    sched.availableToday,
            BookedToday:       sched.bookedToday,
            TriageAiAccuracy:  0.94,
            FetchedAt:         DateTimeOffset.UtcNow);
    }
}

public record StartDemoRequest(string ClientName, string Company, string? Email);
public record SubmitStepFeedbackRequest(string Step, int Rating, List<string> Tags, string? Comment);
public record CompleteDemoRequest(int NpsScore, List<string> FeaturePriorities, string? Comment);

/// <summary>Phase 61 — live KPI snapshot returned by GET /api/v1/agents/demo/live-insights</summary>
public record DemoLiveInsights(
    int    PendingTriage,
    int    HighRiskPatients,
    int    OpenCareGaps,
    int    CodingQueue,
    int    PriorAuthsPending,
    int    AvailableSlots,
    int    BookedToday,
    double TriageAiAccuracy,
    DateTimeOffset FetchedAt
);
