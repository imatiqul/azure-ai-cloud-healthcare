using FluentAssertions;
using HealthQCopilot.Infrastructure.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using NSubstitute;
using System.Security.Claims;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="TenantContextMiddleware"/>.
///
/// The middleware pushes TenantId, UserId, and PatientId into an
/// <see cref="ILogger.BeginScope"/> dictionary so every log record emitted
/// within the request carries these values as OTel attributes.
///
/// Each test captures the scope dictionary via an NSubstitute Arg.Do handler
/// and asserts that the correct values are resolved from headers, JWT claims,
/// and route values according to the priority order defined in the middleware.
/// </summary>
public sealed class TenantContextMiddlewareTests
{
    // ── helper ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates an NSubstitute ILogger that captures whatever dictionary the
    /// middleware passes to BeginScope.
    /// </summary>
    private static ILogger<TenantContextMiddleware> CreateLogger(
        out Dictionary<string, object?> capturedScope)
    {
        var logger = Substitute.For<ILogger<TenantContextMiddleware>>();
        var scope = new Dictionary<string, object?>();
        capturedScope = scope;

        logger.BeginScope(Arg.Do<Dictionary<string, object?>>(d =>
        {
            foreach (var kvp in d)
                scope[kvp.Key] = kvp.Value;
        })).Returns(Substitute.For<IDisposable>());

        return logger;
    }

    // ── TenantId resolution ───────────────────────────────────────────────

    [Fact]
    public async Task XTenantIdHeader_TakesPriorityOverJwtClaim()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Tenant-Id"] = "header-tenant";
        ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tid", "jwt-tenant")]));

        await middleware.InvokeAsync(ctx);

        scope["TenantId"].Should().Be("header-tenant");
    }

    [Fact]
    public async Task JwtTidClaim_UsedWhenNoHeader()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tid", "tenant-from-jwt")]));

        await middleware.InvokeAsync(ctx);

        scope["TenantId"].Should().Be("tenant-from-jwt");
    }

    [Fact]
    public async Task NoTenantHeaderOrClaim_DefaultsToUnknown()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(new DefaultHttpContext());

        scope["TenantId"].Should().Be("unknown");
    }

    // ── UserId resolution ──────────────────────────────────────────────────

    [Fact]
    public async Task JwtSubClaim_SetsUserId()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "user-sub-123")]));

        await middleware.InvokeAsync(ctx);

        scope["UserId"].Should().Be("user-sub-123");
    }

    [Fact]
    public async Task JwtOidClaim_UsedWhenNoSubClaim()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("oid", "user-oid-456")]));

        await middleware.InvokeAsync(ctx);

        scope["UserId"].Should().Be("user-oid-456");
    }

    [Fact]
    public async Task NoUserClaims_DefaultsToAnonymous()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(new DefaultHttpContext());

        scope["UserId"].Should().Be("anonymous");
    }

    // ── PatientId resolution ───────────────────────────────────────────────

    [Fact]
    public async Task PatientIdRouteValue_SetsPatientId()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.Request.RouteValues["patientId"] = "PAT-001";

        await middleware.InvokeAsync(ctx);

        scope["PatientId"].Should().Be("PAT-001");
    }

    [Fact]
    public async Task XPatientIdHeader_UsedWhenNoRouteValue()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-Patient-Id"] = "PAT-002";

        await middleware.InvokeAsync(ctx);

        scope["PatientId"].Should().Be("PAT-002");
    }

    [Fact]
    public async Task NoPatientInfo_DefaultsToDash()
    {
        var logger = CreateLogger(out var scope);
        var middleware = new TenantContextMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(new DefaultHttpContext());

        scope["PatientId"].Should().Be("-");
    }

    // ── Pipeline contract ──────────────────────────────────────────────────

    [Fact]
    public async Task NextMiddleware_AlwaysInvoked_EvenWithNoHeaders()
    {
        var logger = CreateLogger(out _);
        bool nextWasCalled = false;

        var middleware = new TenantContextMiddleware(
            _ => { nextWasCalled = true; return Task.CompletedTask; },
            logger);

        await middleware.InvokeAsync(new DefaultHttpContext());

        nextWasCalled.Should().BeTrue();
    }
}
