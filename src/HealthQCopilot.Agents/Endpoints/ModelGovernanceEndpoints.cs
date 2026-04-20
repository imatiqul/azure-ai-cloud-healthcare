using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Endpoints;

/// <summary>
/// AI model governance endpoints (Item 21).
///
/// These endpoints support ONC HTI-1 / FDA SaMD governance requirements:
///   - Immutable registry of every model version deployed
///   - Golden-set prompt regression testing before promotion
///   - Historical evaluation scores for trend analysis
/// </summary>
public static class ModelGovernanceEndpoints
{
    public static IEndpointRouteBuilder MapModelGovernanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents/governance")
            .WithTags("AI Model Governance");

        // ── POST /register — register a new model deployment ──────────────────

        group.MapPost("/register", async (
            RegisterModelRequest request,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.ModelName))
                return Results.BadRequest(new { error = "ModelName is required" });
            if (string.IsNullOrWhiteSpace(request.DeploymentName))
                return Results.BadRequest(new { error = "DeploymentName is required" });

            // Deactivate any previously active entry for the same model
            var previous = await db.ModelRegistryEntries
                .Where(e => e.ModelName == request.ModelName && e.IsActive)
                .ToListAsync(ct);
            foreach (var prev in previous) prev.Deactivate();

            var entry = ModelRegistryEntry.Register(
                request.ModelName,
                request.ModelVersion,
                request.DeploymentName,
                request.SkVersion,
                request.PromptHash,
                request.PluginManifest ?? "[]",
                request.DeployedByUserId);

            db.ModelRegistryEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/agents/governance/{entry.Id}", new
            {
                entry.Id,
                entry.ModelName,
                entry.ModelVersion,
                entry.DeploymentName,
                entry.DeployedAt,
                entry.IsActive,
            });
        })
        .WithSummary("Register a new AI model version deployment")
        .WithDescription("Creates an immutable governance record for the deployed model. " +
            "Deactivates the previously active entry for the same model name.");

        // ── GET /history — list all registry entries ───────────────────────────

        group.MapGet("/history", async (
            string? modelName,
            int? top,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var query = db.ModelRegistryEntries.AsQueryable();
            if (!string.IsNullOrEmpty(modelName))
                query = query.Where(e => e.ModelName == modelName);

            var entries = await query
                .OrderByDescending(e => e.DeployedAt)
                .Take(top ?? 50)
                .Select(e => new
                {
                    e.Id,
                    e.ModelName,
                    e.ModelVersion,
                    e.DeploymentName,
                    e.SkVersion,
                    e.PromptHash,
                    e.LastEvalScore,
                    e.DeployedAt,
                    e.IsActive,
                })
                .ToListAsync(ct);

            return Results.Ok(entries);
        })
        .WithSummary("List model registry history");

        // ── GET /{id} — single registry entry ─────────────────────────────────

        group.MapGet("/{id:guid}", async (
            Guid id,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var entry = await db.ModelRegistryEntries.FindAsync([id], ct);
            return entry is null ? Results.NotFound() : Results.Ok(entry);
        })
        .WithSummary("Get a model registry entry by ID");

        // ── POST /evaluate — run golden-set regression test ───────────────────

        group.MapPost("/evaluate", async (
            EvaluateModelRequest request,
            PromptRegressionEvaluator evaluator,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            // If no model ID provided, use the most recently registered active entry
            Guid registryId;
            if (request.ModelRegistryEntryId.HasValue)
            {
                registryId = request.ModelRegistryEntryId.Value;
                var exists = await db.ModelRegistryEntries.AnyAsync(e => e.Id == registryId, ct);
                if (!exists) return Results.NotFound(new { error = "ModelRegistryEntry not found" });
            }
            else
            {
                var latest = await db.ModelRegistryEntries
                    .Where(e => e.IsActive)
                    .OrderByDescending(e => e.DeployedAt)
                    .FirstOrDefaultAsync(ct);
                if (latest is null)
                    return Results.BadRequest(new { error = "No active model registry entry found. Register a deployment first." });
                registryId = latest.Id;
            }

            var run = await evaluator.RunAsync(registryId, request.EvaluatedByUserId, ct);

            return run.PassedThreshold
                ? Results.Ok(new
                {
                    run.Id,
                    run.ModelRegistryEntryId,
                    run.Score,
                    run.TotalCases,
                    run.PassedCases,
                    run.PassedThreshold,
                    run.EvaluatedAt,
                    Status = "PASS",
                })
                : Results.UnprocessableEntity(new
                {
                    run.Id,
                    run.ModelRegistryEntryId,
                    run.Score,
                    run.TotalCases,
                    run.PassedCases,
                    run.PassedThreshold,
                    run.EvaluatedAt,
                    Status = "FAIL",
                    Message = "Evaluation score is below the 80% threshold. Review the results and fix failing cases before promotion."
                });
        })
        .WithSummary("Run golden-set prompt regression evaluation for the active model")
        .WithDescription("Exercises 8 fixed clinical triage prompts through the live SK pipeline. " +
            "Returns 422 if the score is below the 80% pass threshold.");

        // ── GET /evaluate/history — list evaluation runs ───────────────────────

        group.MapGet("/evaluate/history", async (
            Guid? modelRegistryEntryId,
            int? top,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PromptEvaluationRuns.AsQueryable();
            if (modelRegistryEntryId.HasValue)
                query = query.Where(r => r.ModelRegistryEntryId == modelRegistryEntryId.Value);

            var runs = await query
                .OrderByDescending(r => r.EvaluatedAt)
                .Take(top ?? 20)
                .Select(r => new
                {
                    r.Id,
                    r.ModelRegistryEntryId,
                    r.Score,
                    r.TotalCases,
                    r.PassedCases,
                    r.PassedThreshold,
                    r.EvaluatedAt,
                })
                .ToListAsync(ct);

            return Results.Ok(runs);
        })
        .WithSummary("List historical prompt evaluation runs");

        // ── GET /prompt-hash — compute SHA-256 hash of a system prompt ────────

        group.MapPost("/prompt-hash", (PromptHashRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Prompt))
                return Results.BadRequest(new { error = "Prompt is required" });

            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.Prompt))).ToLowerInvariant();
            return Results.Ok(new { Hash = hash, Length = request.Prompt.Length });
        })
        .WithSummary("Compute SHA-256 hash of a system prompt for registry tracking");

        return app;
    }
}

// ── Request models ─────────────────────────────────────────────────────────────

public sealed record RegisterModelRequest(
    string ModelName,
    string ModelVersion,
    string DeploymentName,
    string SkVersion,
    string PromptHash,
    string? PluginManifest,
    string DeployedByUserId);

public sealed record EvaluateModelRequest(
    Guid? ModelRegistryEntryId,
    string EvaluatedByUserId);

public sealed record PromptHashRequest(string Prompt);
