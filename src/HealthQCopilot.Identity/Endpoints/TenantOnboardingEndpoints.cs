using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.Endpoints;

/// <summary>
/// Tenant self-service onboarding endpoints (Phase 8 — Item 46).
///
/// Tenants are isolated organisations (hospitals, clinics, health systems) sharing
/// the HealthQ Copilot SaaS platform. Each tenant gets:
///   - A unique TenantId (GUID)
///   - An admin user seeded to the UserAccounts table with Role=Admin
///   - A tenant configuration record with branding, locale, and feature flags label
///
/// GDPR offboarding: DELETE /api/v1/tenants/{id} removes all tenant data (right to erasure).
/// </summary>
public static class TenantOnboardingEndpoints
{
    private sealed class Log { }

    public static IEndpointRouteBuilder MapTenantOnboardingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/tenants")
            .WithTags("Tenant Onboarding")
            .RequireAuthorization("PlatformAdmin");   // only platform admins can provision tenants

        // POST /api/v1/tenants — self-service tenant provisioning
        group.MapPost("/", async (
            ProvisionTenantRequest request,
            IdentityDbContext db,
            ILogger<Log> logger,
            CancellationToken ct) =>
        {
            if (await db.TenantConfigs.AnyAsync(t => t.Slug == request.Slug, ct))
                return Results.Conflict(new { error = $"Tenant slug '{request.Slug}' already exists." });

            var tenantId = Guid.NewGuid();

            var config = TenantConfig.Create(
                tenantId,
                request.OrganisationName,
                request.Slug,
                request.Locale,
                request.AppConfigLabel ?? request.Slug,
                request.DataRegion);

            var adminUser = UserAccount.Create(
                Guid.NewGuid(),
                externalId: $"tenant-admin-{tenantId}",
                email: request.AdminEmail,
                displayName: request.AdminDisplayName,
                role: UserRole.Admin);

            db.TenantConfigs.Add(config);
            db.UserAccounts.Add(adminUser);

            await db.SaveChangesAsync(ct);

            logger.LogInformation("Tenant {TenantId} ({Slug}) provisioned. Admin: {Admin}",
                tenantId, request.Slug, request.AdminEmail);

            return Results.Created($"/api/v1/tenants/{tenantId}", new TenantSummary(
                tenantId,
                config.OrganisationName,
                config.Slug,
                config.Locale,
                config.AppConfigLabel,
                config.DataRegion,
                adminUser.Id));
        });

        // GET /api/v1/tenants/{id} — retrieve tenant configuration
        group.MapGet("/{id:guid}", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var config = await db.TenantConfigs.FindAsync([id], ct);
            return config is null
                ? Results.NotFound()
                : Results.Ok(new TenantSummary(
                    config.TenantId,
                    config.OrganisationName,
                    config.Slug,
                    config.Locale,
                    config.AppConfigLabel,
                    config.DataRegion,
                    AdminUserId: null));
        });

        // GET /api/v1/tenants — list all tenants (paginated)
        group.MapGet("/", async (
            IdentityDbContext db,
            int page = 1,
            int pageSize = 20,
            CancellationToken ct = default) =>
        {
            var skip = (page - 1) * pageSize;
            var total = await db.TenantConfigs.CountAsync(ct);
            var items = await db.TenantConfigs
                .OrderBy(t => t.OrganisationName)
                .Skip(skip)
                .Take(pageSize)
                .Select(t => new TenantSummary(t.TenantId, t.OrganisationName, t.Slug, t.Locale, t.AppConfigLabel, t.DataRegion, null))
                .ToListAsync(ct);

            return Results.Ok(new { total, page, pageSize, items });
        });

        // DELETE /api/v1/tenants/{id} — GDPR right-to-erasure offboarding
        group.MapDelete("/{id:guid}", async (
            Guid id,
            IdentityDbContext db,
            ILogger<Log> logger,
            CancellationToken ct) =>
        {
            var config = await db.TenantConfigs.FindAsync([id], ct);
            if (config is null) return Results.NotFound();

            // Remove all users belonging to this tenant (identified by TenantId on UserAccount)
            var tenantUsers = await db.UserAccounts
                .Where(u => u.TenantId == id)
                .ToListAsync(ct);

            db.UserAccounts.RemoveRange(tenantUsers);
            db.TenantConfigs.Remove(config);

            await db.SaveChangesAsync(ct);

            logger.LogWarning("GDPR ERASURE: Tenant {TenantId} ({Slug}) and {UserCount} users deleted.",
                id, config.Slug, tenantUsers.Count);

            return Results.NoContent();
        });

        return app;
    }
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

public sealed record ProvisionTenantRequest(
    string OrganisationName,
    string Slug,
    string AdminEmail,
    string AdminDisplayName,
    string Locale = "en",
    string? AppConfigLabel = null,
    string DataRegion = "eastus2");

public sealed record TenantSummary(
    Guid TenantId,
    string OrganisationName,
    string Slug,
    string Locale,
    string AppConfigLabel,
    string DataRegion,
    Guid? AdminUserId);
