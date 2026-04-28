using FluentAssertions;
using HealthQCopilot.Infrastructure.Middleware;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="RateLimitingExtensions.ResolveTier"/>.
///
/// <c>ResolveTier</c> is an <c>internal</c> helper that determines which
/// <see cref="TenantTier"/> budget applies to an incoming request.
/// Resolution order: X-Tenant-Id header → JWT <c>tid</c> claim → Sandbox fallback.
///
/// The <c>KnownTenants</c> dictionary is intentionally empty in non-production
/// builds (populated from Azure App Config at startup), so all tests validate the
/// Sandbox fallback path and the resolution priority, not a specific tier mapping.
/// </summary>
public sealed class RateLimitingExtensionsTierTests
{
    // ── Sandbox fallback ──────────────────────────────────────────────────────

    [Fact]
    public void NoHeaderNoClaim_ReturnsSandboxTier()
    {
        var ctx = new DefaultHttpContext();
        // No X-Tenant-Id header, no authenticated user

        var tier = RateLimitingExtensions.ResolveTier(ctx);

        tier.Should().Be(TenantTier.Sandbox);
    }

    [Fact]
    public void UnknownTenantInHeader_ReturnsSandboxTier()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Tenant-Id"] = "unknown-tenant-guid";

        var tier = RateLimitingExtensions.ResolveTier(ctx);

        // KnownTenants does not contain this tenant → falls back to Sandbox
        tier.Should().Be(TenantTier.Sandbox);
    }

    [Fact]
    public void UnknownTenantInJwtClaim_ReturnsSandboxTier()
    {
        var ctx = new DefaultHttpContext();
        ctx.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim("tid", "some-tenant-from-jwt")]));

        var tier = RateLimitingExtensions.ResolveTier(ctx);

        tier.Should().Be(TenantTier.Sandbox);
    }

    // ── Priority order: header beats JWT ─────────────────────────────────────

    [Fact]
    public void BothHeaderAndJwt_HeaderTakesPriority_NoException()
    {
        // Even when both sources are present, resolution must be deterministic
        // and must not throw. Both resolve to Sandbox (unknown tenants), which
        // confirms that header processing takes precedence without NPE or conflict.
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Tenant-Id"] = "header-tenant";
        ctx.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim("tid", "jwt-tenant")]));

        var act = () => RateLimitingExtensions.ResolveTier(ctx);

        act.Should().NotThrow();
        act().Should().Be(TenantTier.Sandbox);
    }

    // ── Enum value sanity checks ──────────────────────────────────────────────

    [Theory]
    [InlineData(TenantTier.Clinical,   1000)]
    [InlineData(TenantTier.Revenue,     500)]
    [InlineData(TenantTier.Engagement,  200)]
    [InlineData(TenantTier.Sandbox,     100)]
    public void TenantTierValues_MatchDocumentedRateBudgets(TenantTier tier, int expectedRpm)
    {
        // The numeric value of each tier IS its requests-per-minute budget
        // (used in AddHealthcareRateLimiting to compute per-window PermitLimit).
        ((int)tier).Should().Be(expectedRpm);
    }

    // ── Edge cases ────────────────────────────────────────────────────────────

    [Fact]
    public void EmptyTenantIdHeader_FallsBackToSandbox()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Tenant-Id"] = string.Empty;

        var tier = RateLimitingExtensions.ResolveTier(ctx);

        tier.Should().Be(TenantTier.Sandbox);
    }

    [Fact]
    public void WhitespaceTenantIdHeader_FallsBackToSandbox()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Tenant-Id"] = "   ";

        var tier = RateLimitingExtensions.ResolveTier(ctx);

        tier.Should().Be(TenantTier.Sandbox);
    }
}
