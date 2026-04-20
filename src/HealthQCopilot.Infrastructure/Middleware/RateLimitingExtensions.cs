using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.Middleware;

/// <summary>
/// Tenant tiers and their associated per-minute request budgets.
/// Tenants are identified by the <c>X-Tenant-Id</c> request header or the
/// <c>tid</c> JWT claim. Unknown / missing tenants fall back to the Sandbox tier.
/// </summary>
public enum TenantTier
{
    /// <summary>Full clinical platform — FHIR, scheduling, agents (1 000 req/min).</summary>
    Clinical    = 1000,
    /// <summary>Revenue cycle and billing workloads (500 req/min).</summary>
    Revenue     = 500,
    /// <summary>Patient engagement portal and notifications (200 req/min).</summary>
    Engagement  = 200,
    /// <summary>Sandbox / trial / unknown tenant (100 req/min).</summary>
    Sandbox     = 100,
}

public static class RateLimitingExtensions
{
    // Header / claim names used to resolve the tenant
    private const string TenantIdHeader = "X-Tenant-Id";
    private const string TenantIdClaim  = "tid";

    /// <summary>
    /// Known tenant → tier mapping.  In production this should be loaded from
    /// Azure App Configuration or a database.  The dictionary is read-only and
    /// shared across all requests (safe for concurrent reads).
    /// </summary>
    private static readonly Dictionary<string, TenantTier> KnownTenants =
        new(StringComparer.OrdinalIgnoreCase)
        {
            // Populate at startup from configuration; hard-coded here for reference.
            // Format: "tenant-guid-or-slug" → TenantTier
        };

    /// <summary>Resolves the tenant tier from the HTTP context.</summary>
    internal static TenantTier ResolveTier(HttpContext ctx)
    {
        // 1. Prefer the explicit header (set by APIM / API Gateway)
        var tenantId = ctx.Request.Headers[TenantIdHeader].FirstOrDefault();

        // 2. Fall back to the JWT 'tid' claim
        if (string.IsNullOrWhiteSpace(tenantId))
            tenantId = ctx.User?.FindFirstValue(TenantIdClaim);

        if (string.IsNullOrWhiteSpace(tenantId))
            return TenantTier.Sandbox;

        return KnownTenants.TryGetValue(tenantId, out var tier) ? tier : TenantTier.Sandbox;
    }

    /// <summary>Registers per-tenant and named-policy rate limiters.</summary>
    public static IServiceCollection AddHealthcareRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Add Retry-After header so clients know when to retry
            options.OnRejected = async (ctx, ct) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    ctx.HttpContext.Response.Headers.RetryAfter =
                        ((int)retryAfter.TotalSeconds).ToString();

                ctx.HttpContext.Response.ContentType = "application/json";
                await ctx.HttpContext.Response.WriteAsync(
                    """{"error":"Too many requests. Please slow down and retry."}""", ct);
            };

            // ── Per-Tenant global limiter ─────────────────────────────────────
            // Partition key: "<tenantId>:<remoteIp>" — isolates each tenant's
            // traffic budget so one noisy tenant cannot starve others.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            {
                var tier     = ResolveTier(ctx);
                var tenantId = ctx.Request.Headers[TenantIdHeader].FirstOrDefault()
                               ?? ctx.User?.FindFirstValue(TenantIdClaim)
                               ?? "anonymous";
                var remoteIp = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var key      = $"{tenantId}:{remoteIp}";

                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: key,
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        // Convert per-minute budget to a 10-second window
                        PermitLimit              = (int)tier / 6,
                        Window                   = TimeSpan.FromSeconds(10),
                        QueueProcessingOrder     = QueueProcessingOrder.OldestFirst,
                        QueueLimit               = Math.Max(1, (int)tier / 60),
                        AutoReplenishment        = true,
                    });
            });

            // ── Named per-tier policies (opt-in via [EnableRateLimiting]) ─────
            // Endpoints can apply a stricter policy by decorating with
            // .RequireRateLimiting("tenant:clinical") etc.
            AddTenantPolicy(options, "tenant:clinical",  TenantTier.Clinical);
            AddTenantPolicy(options, "tenant:revenue",   TenantTier.Revenue);
            AddTenantPolicy(options, "tenant:engagement", TenantTier.Engagement);
            AddTenantPolicy(options, "tenant:sandbox",   TenantTier.Sandbox);

            // ── Legacy named policies (unchanged) ─────────────────────────────
            // Named policy for tighter limits on triage (AI-intensive)
            options.AddPolicy("triage", ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromSeconds(30),
                        QueueLimit = 2,
                    }));

            // Named policy for guide/copilot chat (AI-intensive)
            options.AddPolicy("guide", ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 15,
                        Window = TimeSpan.FromSeconds(30),
                        QueueLimit = 3,
                    }));
        });

        return services;
    }

    public static WebApplication UseHealthcareRateLimiting(this WebApplication app)
    {
        app.UseRateLimiter();
        return app;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void AddTenantPolicy(
        Microsoft.AspNetCore.RateLimiting.RateLimiterOptions options,
        string policyName,
        TenantTier tier)
    {
        options.AddPolicy(policyName, ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit          = (int)tier / 6,  // 10-second window
                    Window               = TimeSpan.FromSeconds(10),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit           = Math.Max(1, (int)tier / 60),
                    AutoReplenishment    = true,
                }));
    }
}

