using Dapr.Client;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Metrics;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.Endpoints;

/// <summary>
/// HIPAA §164.312(a)(2)(ii) Emergency Access Procedure (Break-Glass) endpoints.
///
/// POST   /api/v1/identity/break-glass            — Request emergency access
/// GET    /api/v1/identity/break-glass/{id}        — Get access status
/// GET    /api/v1/identity/break-glass?userId=     — List access records for a user
/// DELETE /api/v1/identity/break-glass/{id}        — Revoke (supervisor action)
///
/// All break-glass events are published as domain events for PHI audit trail.
/// Supervisors are notified asynchronously via Dapr pub/sub.
/// </summary>
public static class BreakGlassEndpoints
{
    public static IEndpointRouteBuilder MapBreakGlassEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/identity/break-glass")
            .WithTags("Break-Glass Access")
            .WithAutoValidation();

        // ── Request break-glass access ────────────────────────────────────────
        group.MapPost("/", async (
            BreakGlassRequest request,
            IdentityDbContext db,
            DaprClient dapr,
            BusinessMetrics metrics,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("HealthQCopilot.Identity.BreakGlass");
            // Verify the requesting user exists
            var user = await db.UserAccounts.FindAsync([request.RequestedByUserId], ct);
            if (user is null)
                return Results.NotFound(new { error = "Requesting user not found." });

            var validFor = request.DurationHours.HasValue
                ? TimeSpan.FromHours(Math.Clamp(request.DurationHours.Value, 1, 8))
                : TimeSpan.FromHours(4); // default 4-hour window

            var access = BreakGlassAccess.Create(
                request.RequestedByUserId,
                request.TargetPatientId,
                request.ClinicalJustification,
                validFor);

            db.BreakGlassAccesses.Add(access);
            await db.SaveChangesAsync(ct);

            // Publish BreakGlassAccessGranted event via Dapr pub/sub for supervisor notification.
            // Fire-and-forget — do not block the HTTP response on pub/sub delivery.
            _ = Task.Run(async () =>
            {
                try
                {
                    await dapr.PublishEventAsync("pubsub", "identity.break-glass.granted", new
                    {
                        access.Id,
                        access.RequestedByUserId,
                        access.TargetPatientId,
                        access.ClinicalJustification,
                        access.GrantedAt,
                        access.ExpiresAt
                    });
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex,
                        "Failed to publish break-glass event to Dapr pub/sub for access {AccessId}",
                        access.Id);
                }
            }, CancellationToken.None);

            metrics.BreakGlassGrantedTotal.Add(1);

            return Results.Created($"/api/v1/identity/break-glass/{access.Id}", new
            {
                access.Id,
                access.RequestedByUserId,
                access.TargetPatientId,
                access.Status,
                access.GrantedAt,
                access.ExpiresAt,
                message = $"Emergency access granted for {validFor.TotalHours:0} hours. All access will be audited."
            });
        }).WithSummary("Request break-glass emergency access (HIPAA §164.312(a)(2)(ii))");

        // ── Get break-glass access status ─────────────────────────────────────
        group.MapGet("/{id:guid}", async (Guid id, IdentityDbContext db, CancellationToken ct) =>
        {
            var access = await db.BreakGlassAccesses
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == id, ct);

            if (access is null)
                return Results.NotFound(new { error = "Break-glass access record not found." });

            return Results.Ok(new
            {
                access.Id,
                access.RequestedByUserId,
                access.TargetPatientId,
                access.Status,
                access.GrantedAt,
                access.ExpiresAt,
                access.RevokedAt,
                access.RevocationReason,
                IsValid = access.IsValid()
            });
        }).WithSummary("Get break-glass access record");

        // ── List break-glass records ──────────────────────────────────────────
        group.MapGet("/", async (
            Guid? userId,
            string? patientId,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var query = db.BreakGlassAccesses.AsNoTracking().AsQueryable();

            if (userId.HasValue)
                query = query.Where(a => a.RequestedByUserId == userId.Value);
            if (!string.IsNullOrEmpty(patientId))
                query = query.Where(a => a.TargetPatientId == patientId);

            var results = await query.OrderByDescending(a => a.GrantedAt).Select(a => new
            {
                a.Id,
                a.RequestedByUserId,
                a.TargetPatientId,
                a.Status,
                a.GrantedAt,
                a.ExpiresAt,
                a.ClinicalJustification
            }).ToListAsync(ct);

            return Results.Ok(results);
        }).WithSummary("List break-glass access records");

        // ── Revoke break-glass access (supervisor action) ─────────────────────
        group.MapDelete("/{id:guid}", async (
            Guid id,
            [FromBody] RevokeBreakGlassRequest? request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var access = await db.BreakGlassAccesses.FindAsync([id], ct);
            if (access is null)
                return Results.NotFound(new { error = "Break-glass access record not found." });

            var supervisorId = request?.SupervisorUserId ?? Guid.Empty;
            var result = access.Revoke(supervisorId, request?.Reason);

            if (result.IsFailure)
                return Results.UnprocessableEntity(new { error = result.Error });

            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                message = "Break-glass access revoked.",
                access.Id,
                access.RevokedAt,
                access.RevokedByUserId
            });
        }).WithSummary("Revoke break-glass access (supervisor)");

        return app;
    }
}

// ── Request models ─────────────────────────────────────────────────────────────

public sealed record BreakGlassRequest(
    Guid RequestedByUserId,
    string TargetPatientId,
    string ClinicalJustification,
    double? DurationHours);

public sealed record RevokeBreakGlassRequest(Guid SupervisorUserId, string? Reason);
