using System.Text.Json;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.RevenueCycle.Infrastructure;
using HealthQCopilot.RevenueCycle.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.RevenueCycle.Endpoints;

public static class RevenueEndpoints
{
    public static IEndpointRouteBuilder MapRevenueEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/revenue")
            .WithTags("Revenue Cycle")
            .WithAutoValidation();

        // ── Coding Jobs ──────────────────────────────────────

        group.MapGet("/coding-jobs", async (
            string? status,
            int? top,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var query = db.CodingJobs.AsQueryable();
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<CodingJobStatus>(status, true, out var s))
                query = query.Where(j => j.Status == s);
            var jobs = await query.OrderByDescending(j => j.CreatedAt).Take(top ?? 50)
                .Select(j => new
                {
                    j.Id,
                    j.EncounterId,
                    j.PatientId,
                    j.PatientName,
                    SuggestedCodes = j.SuggestedCodes,
                    ApprovedCodes = j.ApprovedCodes,
                    j.Status,
                    j.CreatedAt,
                    j.ReviewedAt,
                    j.ReviewedBy
                })
                .ToListAsync(ct);
            return Results.Ok(jobs);
        });

        group.MapGet("/coding-jobs/{id:guid}", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            return job is null ? Results.NotFound() : Results.Ok(new
            {
                job.Id,
                job.EncounterId,
                job.PatientId,
                job.PatientName,
                SuggestedCodes = job.SuggestedCodes,
                ApprovedCodes = job.ApprovedCodes,
                job.Status,
                job.CreatedAt,
                job.ReviewedAt,
                job.ReviewedBy
            });
        });

        group.MapPost("/coding-jobs", async (
            CreateCodingJobRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = CodingJob.Create(request.EncounterId, request.PatientId, request.PatientName, request.SuggestedCodes);
            db.CodingJobs.Add(job);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/coding-jobs/{job.Id}",
                new { job.Id, job.EncounterId, job.Status });
        });

        group.MapPost("/coding-jobs/{id:guid}/review", async (
            Guid id,
            ReviewCodingJobRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            if (job is null) return Results.NotFound();
            var result = job.Review(request.ApprovedCodes, request.ReviewedBy);
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { job.Id, job.Status, job.ApprovedCodes });
        });

        group.MapPost("/coding-jobs/{id:guid}/submit", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            if (job is null) return Results.NotFound();
            var result = job.Submit();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { job.Id, job.Status });
        });

        // ── Prior Authorizations ──────────────────────────────

        group.MapGet("/prior-auths", async (
            string? status,
            int? top,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PriorAuths.AsQueryable();
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<PriorAuthStatus>(status, true, out var s))
                query = query.Where(a => a.Status == s);
            var auths = await query.OrderByDescending(a => a.CreatedAt).Take(top ?? 50)
                .Select(a => new
                {
                    a.Id,
                    a.PatientId,
                    a.PatientName,
                    a.Procedure,
                    a.ProcedureCode,
                    a.Status,
                    a.InsurancePayer,
                    a.DenialReason,
                    a.CreatedAt,
                    a.SubmittedAt,
                    a.ResolvedAt
                })
                .ToListAsync(ct);
            return Results.Ok(auths);
        });

        group.MapGet("/prior-auths/{id:guid}", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            return auth is null ? Results.NotFound() : Results.Ok(new
            {
                auth.Id,
                auth.PatientId,
                auth.PatientName,
                auth.Procedure,
                auth.ProcedureCode,
                auth.Status,
                auth.InsurancePayer,
                auth.DenialReason,
                auth.CreatedAt,
                auth.SubmittedAt,
                auth.ResolvedAt
            });
        });

        group.MapPost("/prior-auths", async (
            CreatePriorAuthRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = PriorAuth.Create(
                request.PatientId, request.PatientName,
                request.Procedure, request.ProcedureCode, request.InsurancePayer);
            db.PriorAuths.Add(auth);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/prior-auths/{auth.Id}",
                new { auth.Id, auth.PatientId, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/submit", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Submit();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { auth.Id, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/approve", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Approve();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { auth.Id, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/deny", async (
            Guid id,
            DenyPriorAuthRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Deny(request.Reason);
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { auth.Id, auth.Status, auth.DenialReason });
        });

        // ── Summary Stats ────────────────────────────────────

        group.MapGet("/stats", async (
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            const string cacheKey = "healthq:revenue:stats";
            var cached = await cache.GetAsync(cacheKey, ct);
            if (cached is not null)
                return Results.Ok(JsonSerializer.Deserialize<object>(cached));

            var pendingCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Pending, ct);
            var reviewedCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Approved, ct);
            var submittedCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Submitted, ct);
            var pendingAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Submitted || a.Status == PriorAuthStatus.UnderReview, ct);
            var approvedAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Approved, ct);
            var deniedAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Denied, ct);

            var stats = new
            {
                CodingQueue = pendingCoding,
                CodingReviewed = reviewedCoding,
                CodingSubmitted = submittedCoding,
                PriorAuthsPending = pendingAuths,
                PriorAuthsApproved = approvedAuths,
                PriorAuthsDenied = deniedAuths
            };

            await cache.SetAsync(cacheKey, JsonSerializer.SerializeToUtf8Bytes(stats),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) }, ct);

            return Results.Ok(stats);
        });

        // Auto-create coding job from triage result (called by Agents service WorkflowDispatcher)
        group.MapPost("/coding-jobs/from-triage", async (
            FromTriageRequest request,
            RevenueDbContext db,
            CodeSuggestionService codeSuggestion,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var codes = codeSuggestion.SuggestCodes(request.TriageLevel, request.TriageReasoning);
            var shortId = request.SessionId.Length >= 8 ? request.SessionId[..8] : request.SessionId;
            var job = CodingJob.Create(
                encounterId: $"ENC-{shortId}",
                patientId: $"PAT-{shortId}",
                patientName: "AI-Triaged Patient",
                suggestedCodes: codes);
            db.CodingJobs.Add(job);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/coding-jobs/{job.Id}",
                new { job.Id, job.EncounterId, job.Status, SuggestedCodes = codes });
        });

        return app;
    }
}

public record CreateCodingJobRequest(string EncounterId, string PatientId, string PatientName, List<string> SuggestedCodes);
public record ReviewCodingJobRequest(List<string> ApprovedCodes, string ReviewedBy);
public record CreatePriorAuthRequest(string PatientId, string PatientName, string Procedure, string? ProcedureCode, string? InsurancePayer);
public record DenyPriorAuthRequest(string Reason);
public record FromTriageRequest(string SessionId, string TriageLevel, string TriageReasoning);
