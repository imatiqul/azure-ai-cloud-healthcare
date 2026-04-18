using System.Threading.RateLimiting;
using HealthQCopilot.Agents.Services;
using Microsoft.AspNetCore.RateLimiting;

namespace HealthQCopilot.Agents.Endpoints;

public static class GuideEndpoints
{
    public static IEndpointRouteBuilder MapGuideEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents/guide")
            .WithTags("Platform Guide")
            .RequireRateLimiting("guide");

        group.MapPost("/chat", async (
            GuideChatRequest request,
            GuideOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var sessionId = request.SessionId ?? Guid.NewGuid();
            var response = await orchestrator.ChatAsync(sessionId, request.Message, ct);
            return Results.Ok(response);
        })
        .WithName("GuideChat")
        .WithSummary("Send a message to the HealthQ Copilot platform guide agent");

        group.MapGet("/suggestions", () =>
        {
            var suggestions = new[]
            {
                new GuideSuggestion("overview", "Show me the platform overview", "Learn what each module does"),
                new GuideSuggestion("workflow", "Guide me through the clinical workflow", "Step-by-step patient journey"),
                new GuideSuggestion("dashboard", "Show me the dashboard summary", "Real-time stats from all services"),
                new GuideSuggestion("triage", "What's the triage status?", "Pending cases and priorities"),
                new GuideSuggestion("scheduling", "Show available appointment slots", "Today's calendar overview"),
                new GuideSuggestion("revenue", "Show revenue cycle stats", "Coding queue and prior auth status"),
                new GuideSuggestion("pophealth", "Show high-risk patients", "Critical patients needing attention"),
                new GuideSuggestion("next", "What should I do next?", "Get guided to the next workflow step"),
            };
            return Results.Ok(suggestions);
        })
        .WithName("GuideSuggestions")
        .WithSummary("Get contextual suggestions for the platform guide");

        return app;
    }
}

public record GuideChatRequest(string Message, Guid? SessionId);
public record GuideSuggestion(string Id, string Text, string Description);
