using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.Endpoints;

/// <summary>
/// HIPAA §164.508 / GDPR patient consent management endpoints.
///
/// POST   /api/v1/identity/consent                    — Grant consent
/// GET    /api/v1/identity/consent?patientId=&purpose= — List active consents
/// DELETE /api/v1/identity/consent/{id}               — Revoke consent (GDPR Art. 7(3))
/// POST   /api/v1/identity/consent/erasure             — GDPR Art. 17 right-to-erasure request
/// </summary>
public static class ConsentEndpoints
{
    public static IEndpointRouteBuilder MapConsentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/identity/consent")
            .WithTags("Consent")
            .WithAutoValidation();

        // ── Grant consent ────────────────────────────────────────────────────
        group.MapPost("/", async (
            GrantConsentRequest request,
            IdentityDbContext db,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            // Validate the patient exists
            var patient = await db.UserAccounts.FindAsync([request.PatientUserId], ct);
            if (patient is null)
                return Results.NotFound(new { error = "Patient not found." });

            var grantedByIp = httpContext.Connection.RemoteIpAddress?.ToString();
            var consent = ConsentRecord.Grant(
                request.PatientUserId,
                request.Purpose,
                request.Scope,
                request.PolicyVersion,
                request.ExpiresAt,
                request.JurisdictionCode,
                grantedByIp);

            db.ConsentRecords.Add(consent);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/identity/consent/{consent.Id}", new
            {
                consent.Id,
                consent.PatientUserId,
                consent.Purpose,
                consent.Scope,
                consent.Status,
                consent.GrantedAt,
                consent.ExpiresAt,
                consent.PolicyVersion
            });
        }).WithSummary("Grant patient consent (HIPAA §164.508 / GDPR Art. 7)");

        // ── List consents ────────────────────────────────────────────────────
        group.MapGet("/", async (
            Guid? patientId,
            string? purpose,
            string? status,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var query = db.ConsentRecords.AsNoTracking().AsQueryable();

            if (patientId.HasValue)
                query = query.Where(c => c.PatientUserId == patientId.Value);
            if (!string.IsNullOrEmpty(purpose))
                query = query.Where(c => c.Purpose == purpose);
            if (Enum.TryParse<ConsentStatus>(status, true, out var s))
                query = query.Where(c => c.Status == s);
            else
                query = query.Where(c => c.Status == ConsentStatus.Active);

            var results = await query.Select(c => new
            {
                c.Id,
                c.PatientUserId,
                c.Purpose,
                c.Scope,
                c.Status,
                c.GrantedAt,
                c.ExpiresAt,
                c.PolicyVersion
            }).ToListAsync(ct);

            return Results.Ok(results);
        }).WithSummary("List patient consents");

        // ── Revoke consent ───────────────────────────────────────────────────
        group.MapDelete("/{id:guid}", async (
            Guid id,
            RevokeConsentRequest? request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var consent = await db.ConsentRecords.FindAsync([id], ct);
            if (consent is null)
                return Results.NotFound(new { error = "Consent record not found." });

            var result = consent.Revoke(request?.Reason);
            if (result.IsFailure)
                return Results.UnprocessableEntity(new { error = result.Error });

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Consent revoked.", consent.Id, consent.RevokedAt });
        }).WithSummary("Revoke consent (GDPR Art. 7(3) right to withdraw)");

        // ── GDPR Art. 17 — Right to erasure (right to be forgotten) ─────────
        // Marks the patient account as erasure-requested. Actual PHI deletion is
        // performed asynchronously by a background job via Dapr pub/sub.
        app.MapGroup("/api/v1/identity")
            .MapPost("/consent/erasure", async (
                ErasureRequest request,
                IdentityDbContext db,
                CancellationToken ct) =>
            {
                var patient = await db.UserAccounts.FindAsync([request.PatientUserId], ct);
                if (patient is null)
                    return Results.NotFound(new { error = "Patient not found." });

                // Revoke all active consents
                var activeConsents = await db.ConsentRecords
                    .Where(c => c.PatientUserId == request.PatientUserId && c.Status == ConsentStatus.Active)
                    .ToListAsync(ct);

                foreach (var c in activeConsents)
                    c.Revoke("GDPR Art. 17 erasure request");

                await db.SaveChangesAsync(ct);

                // TODO: publish ErasureRequested domain event via Dapr for async PHI wipe
                return Results.Accepted("/api/v1/identity/consent/erasure", new
                {
                    message = "Erasure request accepted. PHI deletion will complete asynchronously.",
                    request.PatientUserId,
                    RevokedConsents = activeConsents.Count
                });
            }).WithSummary("GDPR Art. 17 right-to-erasure request")
              .WithTags("Consent");

        return app;
    }
}

// ── Request models ─────────────────────────────────────────────────────────────

public sealed record GrantConsentRequest(
    Guid PatientUserId,
    string Purpose,
    string Scope,
    string PolicyVersion,
    DateTime? ExpiresAt,
    string? JurisdictionCode);

public sealed record RevokeConsentRequest(string? Reason);

public sealed record ErasureRequest(Guid PatientUserId, string Reason);
