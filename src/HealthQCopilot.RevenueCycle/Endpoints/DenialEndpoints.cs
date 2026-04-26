using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.RevenueCycle.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HealthQCopilot.RevenueCycle.Endpoints;

/// <summary>
/// Claim denial management endpoints.
/// Tracks payer denials, supports appeal submission, resubmission, and resolution.
/// Follows ANSI X12 835 denial processing conventions (CARC/RARC codes).
/// </summary>
public static class DenialEndpoints
{
    public static IEndpointRouteBuilder MapDenialEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/revenue/denials")
            .WithTags("Revenue Cycle — Denials")
            .WithAutoValidation();

        // ── GET /denials — list denials with optional filters ─────────────────
        group.MapGet("/", async (
            string? status,
            string? patientId,
            string? payerId,
            int? top,
            RevenueDbContext db,
            ILogger<Program> logger,
            CancellationToken ct) =>
        {
            var query = db.ClaimDenials.AsQueryable();

            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<DenialStatus>(status, true, out var s))
                query = query.Where(d => d.Status == s);
            if (!string.IsNullOrWhiteSpace(patientId))
                query = query.Where(d => d.PatientId == patientId);
            if (!string.IsNullOrWhiteSpace(payerId))
                query = query.Where(d => d.PayerId == payerId);

            try
            {
                var denials = await query
                    .OrderByDescending(d => d.DeniedAt)
                    .Take(top ?? 50)
                    .Select(d => new
                    {
                        d.Id,
                        d.CodingJobId,
                        d.ClaimNumber,
                        d.PatientId,
                        d.PayerId,
                        d.PayerName,
                        d.DenialReasonCode,
                        d.DenialReasonDescription,
                        Category = d.Category.ToString(),
                        Status = d.Status.ToString(),
                        Resolution = d.Resolution.HasValue ? d.Resolution.Value.ToString() : null,
                        d.DeniedAmount,
                        d.DeniedAt,
                        d.AppealDeadline,
                        d.AppealedAt,
                        d.ResubmissionCount,
                        d.LastResubmittedAt,
                        d.ResolvedAt,
                        DaysUntilDeadline = (int)(d.AppealDeadline - DateTime.UtcNow).TotalDays,
                    })
                    .ToListAsync(ct);

                return Results.Ok(denials);
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                logger.LogWarning(ex, "claim_denials table is missing; returning empty denial list");
                return Results.Ok(Array.Empty<object>());
            }
        })
        .WithSummary("List claim denials")
        .WithDescription("Returns payer denials filtered by status, patient, or payer. Includes days until appeal deadline.");

        // ── GET /denials/{id} — get single denial ─────────────────────────────
        group.MapGet("/{id:guid}", async (Guid id, RevenueDbContext db, CancellationToken ct) =>
        {
            var d = await db.ClaimDenials.FindAsync([id], ct);
            if (d is null) return Results.NotFound();
            return Results.Ok(new
            {
                d.Id,
                d.CodingJobId,
                d.ClaimNumber,
                d.PatientId,
                d.PayerId,
                d.PayerName,
                d.DenialReasonCode,
                d.DenialReasonDescription,
                Category = d.Category.ToString(),
                Status = d.Status.ToString(),
                Resolution = d.Resolution?.ToString(),
                d.DeniedAmount,
                d.DeniedAt,
                d.AppealDeadline,
                d.AppealedAt,
                d.AppealNotes,
                d.ResubmissionCount,
                d.LastResubmittedAt,
                d.ResolvedAt,
                DaysUntilDeadline = (int)(d.AppealDeadline - DateTime.UtcNow).TotalDays,
            });
        })
        .WithSummary("Get denial by ID");

        // ── POST /denials — record a new denial ───────────────────────────────
        group.MapPost("/", async (
            CreateDenialRequest request,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            if (!Enum.TryParse<DenialCategory>(request.Category, true, out var category))
                return Results.BadRequest($"Unknown category '{request.Category}'");

            var denial = ClaimDenial.Create(
                request.CodingJobId,
                request.ClaimNumber,
                request.PatientId,
                request.PayerId,
                request.PayerName,
                request.DenialReasonCode,
                request.DenialReasonDescription,
                category,
                request.DeniedAmount);

            db.ClaimDenials.Add(denial);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/revenue/denials/{denial.Id}",
                new { denial.Id, denial.ClaimNumber, Status = denial.Status.ToString(), denial.AppealDeadline });
        })
        .WithSummary("Record a new claim denial")
        .WithDescription("Creates a denial record when a clearinghouse 835 remittance contains a denial adjustment.");

        // ── PUT /denials/{id}/appeal — submit an appeal ───────────────────────
        group.MapPut("/{id:guid}/appeal", async (
            Guid id,
            AppealRequest request,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var denial = await db.ClaimDenials.FindAsync([id], ct);
            if (denial is null) return Results.NotFound();

            var result = denial.Appeal(request.AppealNotes);
            if (!result.IsSuccess) return Results.BadRequest(result.Error);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { denial.Id, Status = denial.Status.ToString(), denial.AppealedAt });
        })
        .WithSummary("Submit an appeal for a denied claim");

        // ── POST /denials/{id}/resubmit — resubmit corrected claim ───────────
        group.MapPost("/{id:guid}/resubmit", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var denial = await db.ClaimDenials.FindAsync([id], ct);
            if (denial is null) return Results.NotFound();

            var result = denial.Resubmit();
            if (!result.IsSuccess) return Results.BadRequest(result.Error);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                denial.Id,
                Status = denial.Status.ToString(),
                denial.ResubmissionCount,
                denial.LastResubmittedAt,
            });
        })
        .WithSummary("Resubmit a corrected claim")
        .WithDescription("Increments the resubmission counter and updates status. Maximum 3 resubmission attempts.");

        // ── PUT /denials/{id}/resolve — resolve a denial ──────────────────────
        group.MapPut("/{id:guid}/resolve", async (
            Guid id,
            ResolveRequest request,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var denial = await db.ClaimDenials.FindAsync([id], ct);
            if (denial is null) return Results.NotFound();

            if (!Enum.TryParse<DenialResolution>(request.Resolution, true, out var resolution))
                return Results.BadRequest($"Unknown resolution '{request.Resolution}'");

            var result = denial.Resolve(resolution);
            if (!result.IsSuccess) return Results.BadRequest(result.Error);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { denial.Id, Status = denial.Status.ToString(), Resolution = denial.Resolution?.ToString(), denial.ResolvedAt });
        })
        .WithSummary("Resolve a claim denial (overturn, write-off, partial, or patient bill)");

        // ── GET /denials/analytics — denial analytics summary ─────────────────
        group.MapGet("/analytics", async (RevenueDbContext db, ILogger<Program> logger, CancellationToken ct) =>
        {
            List<ClaimDenial> all;
            try
            {
                all = await db.ClaimDenials.ToListAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                logger.LogWarning(ex, "claim_denials table is missing; returning empty denial analytics");
                return Results.Ok(new
                {
                    totalOpen = 0,
                    totalUnderAppeal = 0,
                    totalResolved = 0,
                    overturned = 0,
                    overturnRate = 0d,
                    nearDeadlineCount = 0,
                    byCategory = new Dictionary<string, int>(),
                });
            }

            var total = all.Count;
            var totalOpen = all.Count(d => d.Status == DenialStatus.Open);
            var totalUnderAppeal = all.Count(d => d.Status == DenialStatus.UnderAppeal);
            var totalResolved = all.Count(d => d.Status == DenialStatus.Resolved);
            var overturned = all.Count(d => d.Resolution == DenialResolution.Overturned);
            var nearDeadlineCount = all.Count(d => d.Status == DenialStatus.Open && (d.AppealDeadline - DateTime.UtcNow).TotalDays <= 30);
            var overturnRate = total > 0 ? Math.Round((double)overturned / total, 4) : 0d;

            // byCategory: dictionary of category name → count (matches frontend Record<string, number>)
            var byCategory = all
                .GroupBy(d => d.Category.ToString())
                .ToDictionary(g => g.Key, g => g.Count());

            return Results.Ok(new
            {
                totalOpen,
                totalUnderAppeal,
                totalResolved,
                overturned,
                overturnRate,   // decimal 0-1; frontend multiplies ×100 for display
                nearDeadlineCount,
                byCategory,
            });
        })
        .WithSummary("Denial analytics summary")
        .WithDescription("Aggregated denial metrics: overturn rate, amounts, category breakdown, near-deadline alerts.");

        return app;
    }
}

public record CreateDenialRequest(
    Guid CodingJobId,
    string ClaimNumber,
    string PatientId,
    string PayerId,
    string PayerName,
    string DenialReasonCode,
    string DenialReasonDescription,
    string Category,
    decimal DeniedAmount);

public record AppealRequest(string AppealNotes);
public record ResolveRequest(string Resolution);
