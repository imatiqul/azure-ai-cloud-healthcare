using System.Text.Json;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.PopulationHealth.Infrastructure;
using HealthQCopilot.PopulationHealth.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.PopulationHealth.Endpoints;

public static class PopHealthEndpoints
{
    public static IEndpointRouteBuilder MapPopHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/population-health")
            .WithTags("Population Health");

        group.MapGet("/risks", async (
            string? riskLevel,
            int? top,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PatientRisks.AsQueryable();
            if (!string.IsNullOrEmpty(riskLevel) && Enum.TryParse<RiskLevel>(riskLevel, true, out var level))
                query = query.Where(r => r.Level == level);
            var risks = await query
                .OrderByDescending(r => r.RiskScore)
                .Take(top ?? 50)
                .Select(r => new { r.Id, r.PatientId, Level = r.Level.ToString(), r.RiskScore, r.AssessedAt })
                .ToListAsync(ct);
            return Results.Ok(risks);
        });

        group.MapGet("/risks/{patientId:guid}", async (
            Guid patientId,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var risk = await db.PatientRisks
                .Where(r => r.PatientId == patientId.ToString())
                .OrderByDescending(r => r.AssessedAt)
                .FirstOrDefaultAsync(ct);
            return risk is null ? Results.NotFound() : Results.Ok(risk);
        });

        group.MapGet("/care-gaps", async (
            string? status,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var query = db.CareGaps.AsQueryable();
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<CareGapStatus>(status, true, out var s))
                query = query.Where(g => g.Status == s);
            var gaps = await query
                .OrderByDescending(g => g.IdentifiedAt)
                .Take(100)
                .Select(g => new { g.Id, g.PatientId, MeasureName = g.MeasureId, Status = g.Status.ToString(), g.IdentifiedAt })
                .ToListAsync(ct);
            return Results.Ok(gaps);
        });

        group.MapPost("/care-gaps/{id:guid}/address", async (
            Guid id,
            PopHealthDbContext db,
            IDistributedCache cache,
            CareGapNotificationDispatcher notificationDispatcher,
            CancellationToken ct) =>
        {
            var gap = await db.CareGaps.FindAsync([id], ct);
            if (gap is null) return Results.NotFound();
            gap.Address();
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:pophealth:stats", ct);
            // Fire-and-forget: create follow-up notification campaign for this patient
            _ = Task.Run(() => notificationDispatcher.DispatchCareGapAddressedAsync(gap, CancellationToken.None));
            return Results.Ok(new { gap.Id, Status = gap.Status.ToString() });
        });

        group.MapGet("/stats", async (
            PopHealthDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            const string cacheKey = "healthq:pophealth:stats";
            var cached = await cache.GetAsync(cacheKey, ct);
            if (cached is not null)
                return Results.Ok(JsonSerializer.Deserialize<object>(cached));

            var highRisk = await db.PatientRisks.CountAsync(r => r.Level == RiskLevel.Critical || r.Level == RiskLevel.High, ct);
            var totalPatients = await db.PatientRisks.CountAsync(ct);
            var openGaps = await db.CareGaps.CountAsync(g => g.Status == CareGapStatus.Open, ct);
            var closedGaps = await db.CareGaps.CountAsync(g => g.Status == CareGapStatus.Addressed, ct);
            var stats = new { HighRiskPatients = highRisk, TotalPatients = totalPatients, OpenCareGaps = openGaps, ClosedCareGaps = closedGaps };

            await cache.SetAsync(cacheKey, JsonSerializer.SerializeToUtf8Bytes(stats),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) }, ct);

            return Results.Ok(stats);
        });

        group.MapPost("/risks/calculate", async (
            CalculateRiskRequest request,
            PopHealthDbContext db,
            RiskCalculationService calculator,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId))
                return Results.BadRequest(new { error = "PatientId is required" });

            var existing = await db.PatientRisks
                .Where(r => r.PatientId == request.PatientId)
                .OrderByDescending(r => r.AssessedAt)
                .FirstOrDefaultAsync(ct);

            PatientRisk risk;
            if (existing is not null)
                risk = calculator.Recalculate(request.PatientId, existing.RiskFactors, request.Conditions, request.TriageLevel);
            else
                risk = calculator.Calculate(request.PatientId, request.Conditions, request.TriageLevel);

            db.PatientRisks.Add(risk);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:pophealth:stats", ct);

            return Results.Created($"/api/v1/population-health/risks/{request.PatientId}",
                new { risk.Id, risk.PatientId, Level = risk.Level.ToString(), risk.RiskScore, risk.AssessedAt });
        }).WithSummary("Calculate and persist a fresh risk score for a patient");

        return app;
    }
}

public sealed record CalculateRiskRequest(
    string PatientId,
    IReadOnlyList<string> Conditions,
    string? TriageLevel = null);
