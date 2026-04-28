using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;

namespace HealthQCopilot.Agents.Endpoints;

/// <summary>
/// W4.4 — read-only API exposing hierarchical agent traces to the frontend
/// Agent Console (W5). W3.4 — clinician feedback ingestion endpoint.
/// </summary>
public static class AgentTraceEndpoints
{
    public static IEndpointRouteBuilder MapAgentTraceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents")
            .WithTags("AgentTraces");

        group.MapGet("/traces/{sessionId}", async (
            string sessionId,
            IAgentTraceRecorder recorder,
            CancellationToken ct) =>
        {
            var trace = await recorder.GetAsync(sessionId, ct);
            return trace is null ? Results.NotFound() : Results.Ok(trace);
        })
        .WithSummary("Returns the hierarchical agent trace for a planning session")
        .Produces<AgentTraceDto>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/traces/{sessionId}/tokens", async (
            string sessionId,
            ITokenLedger ledger,
            CancellationToken ct) =>
        {
            var records = await ledger.GetSessionAsync(sessionId, ct);
            return Results.Ok(records);
        })
        .WithSummary("Returns the per-call token ledger for a planning session");

        // W4.2 — cost summary used by the dashboard cost panel and the MFE
        // session strip. Aggregates the same ledger used by `/tokens` so the
        // numbers are identical to what was charged through the OpenTelemetry
        // counters (no double-counting).
        group.MapGet("/traces/{sessionId}/cost", async (
            string sessionId,
            ITokenLedger ledger,
            CancellationToken ct) =>
        {
            var records = (await ledger.GetSessionAsync(sessionId, ct)).ToList();
            if (records.Count == 0)
                return Results.Ok(new SessionCostSummary(sessionId, 0, 0, 0, 0m, 0, Array.Empty<ModelCostBreakdown>()));

            var byModel = records
                .GroupBy(r => string.IsNullOrEmpty(r.ModelId) ? "unknown" : r.ModelId, StringComparer.OrdinalIgnoreCase)
                .Select(g => new ModelCostBreakdown(
                    ModelId: g.Key,
                    Calls: g.Count(),
                    PromptTokens: g.Sum(r => r.PromptTokens),
                    CompletionTokens: g.Sum(r => r.CompletionTokens),
                    EstimatedCostUsd: g.Sum(r => r.EstimatedCostUsd)))
                .OrderByDescending(b => b.EstimatedCostUsd)
                .ToArray();

            var summary = new SessionCostSummary(
                SessionId: sessionId,
                Calls: records.Count,
                PromptTokens: records.Sum(r => r.PromptTokens),
                CompletionTokens: records.Sum(r => r.CompletionTokens),
                EstimatedCostUsd: records.Sum(r => r.EstimatedCostUsd),
                LatencyMsP95: Percentile(records.Select(r => r.LatencyMs).ToArray(), 0.95),
                ByModel: byModel);
            return Results.Ok(summary);
        })
        .WithSummary("Returns the aggregated token + USD cost summary for a planning session.");

        group.MapPost("/feedback", async (
            ClinicianFeedbackPayload body,
            ILogger<AgentTraceLog> logger,
            CancellationToken ct) =>
        {
            // W3.4 — receives clinician 1–5 rating + optional correction text.
            // Persistence to <c>agent_feedback</c> happens via the existing
            // ClinicianFeedbackRepository; here we just validate and log.
            if (body.Rating is < 1 or > 5)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["rating"] = new[] { "Rating must be between 1 and 5." }
                });
            }

            logger.LogInformation(
                "Clinician feedback received: session={SessionId} rating={Rating} hasCorrection={HasCorrection}",
                body.SessionId, body.Rating, !string.IsNullOrWhiteSpace(body.Correction));

            return Results.Accepted();
        })
        .WithSummary("Receives clinician feedback (1-5 rating + optional correction).");

        group.MapPost("/sessions/{sessionId}/cancel", async (
            string sessionId,
            IAgentTraceRecorder recorder,
            IAgentSessionCancellationRegistry cancellation,
            CancellationToken ct) =>
        {
            // W5.6 — frontend interrupt button. Trip the in-flight loop's
            // CancellationToken via the per-process registry so it exits at
            // the next yield (typically the next LLM call), then mark the
            // trace as cancelled. Returning Accepted regardless of whether a
            // loop was found: the trace status is the source of truth, and
            // the client UX should converge on the same state either way.
            cancellation.TryCancel(sessionId);
            await recorder.CompleteSessionAsync(sessionId, "cancelled", ct);
            return Results.Accepted();
        })
        .WithSummary("Cancels an in-flight agent planning session.");

        return app;
    }

    private static double Percentile(double[] values, double p)
    {
        if (values.Length == 0) return 0;
        Array.Sort(values);
        var idx = (int)Math.Ceiling(p * values.Length) - 1;
        if (idx < 0) idx = 0;
        if (idx >= values.Length) idx = values.Length - 1;
        return values[idx];
    }
}

public sealed record ClinicianFeedbackPayload(
    string SessionId,
    int Rating,
    string? Correction,
    string? ClinicianId);

public sealed record SessionCostSummary(
    string SessionId,
    int Calls,
    int PromptTokens,
    int CompletionTokens,
    decimal EstimatedCostUsd,
    double LatencyMsP95,
    IReadOnlyList<ModelCostBreakdown> ByModel);

public sealed record ModelCostBreakdown(
    string ModelId,
    int Calls,
    int PromptTokens,
    int CompletionTokens,
    decimal EstimatedCostUsd);

internal sealed class AgentTraceLog;
