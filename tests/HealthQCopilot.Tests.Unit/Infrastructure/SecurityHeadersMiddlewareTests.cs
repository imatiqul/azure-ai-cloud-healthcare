using FluentAssertions;
using HealthQCopilot.Infrastructure.Middleware;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="SecurityHeadersMiddleware"/>.
///
/// The middleware must set seven OWASP-recommended security headers on every
/// response and must always call the next middleware delegate.
/// </summary>
public sealed class SecurityHeadersMiddlewareTests
{
    // ── All seven headers are set ─────────────────────────────────────────────

    [Fact]
    public async Task AllSecurityHeaders_AreSetOnEveryResponse()
    {
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await middleware.InvokeAsync(ctx);

        var headers = ctx.Response.Headers;

        headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
        headers["X-Frame-Options"].ToString().Should().Be("DENY");
        headers["X-XSS-Protection"].ToString().Should().Be("0");
        headers["Referrer-Policy"].ToString().Should().Be("strict-origin-when-cross-origin");
        headers["Permissions-Policy"].ToString().Should().Be("camera=(), microphone=(), geolocation=()");
        headers["Content-Security-Policy"].ToString().Should().Be("default-src 'self'; frame-ancestors 'none'");
        headers["Strict-Transport-Security"].ToString().Should().Be("max-age=31536000; includeSubDomains");
    }

    // ── Individual header spot-checks (catch targeted regressions) ───────────

    [Fact]
    public async Task XContentTypeOptions_IsNoSniff()
    {
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await middleware.InvokeAsync(ctx);

        ctx.Response.Headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
    }

    [Fact]
    public async Task XFrameOptions_IsDeny()
    {
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await middleware.InvokeAsync(ctx);

        ctx.Response.Headers["X-Frame-Options"].ToString().Should().Be("DENY");
    }

    [Fact]
    public async Task ContentSecurityPolicy_ForbidsFrameAncestors()
    {
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await middleware.InvokeAsync(ctx);

        ctx.Response.Headers["Content-Security-Policy"].ToString()
            .Should().Contain("frame-ancestors 'none'");
    }

    [Fact]
    public async Task StrictTransportSecurity_HasMinimumMaxAge_AndIncludesSubDomains()
    {
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await middleware.InvokeAsync(ctx);

        var hsts = ctx.Response.Headers["Strict-Transport-Security"].ToString();
        hsts.Should().Contain("max-age=31536000");
        hsts.Should().Contain("includeSubDomains");
    }

    // ── Pipeline contract ─────────────────────────────────────────────────────

    [Fact]
    public async Task NextMiddleware_AlwaysInvoked()
    {
        bool nextWasCalled = false;
        var middleware = new SecurityHeadersMiddleware(_ =>
        {
            nextWasCalled = true;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(new DefaultHttpContext());

        nextWasCalled.Should().BeTrue();
    }

    [Fact]
    public async Task Headers_SetBeforeNextIsInvoked()
    {
        // Verify headers are stamped before the inner pipeline runs (important for
        // downstream middleware that may read them, e.g. response caching middleware)
        string? cspWhenNextRuns = null;

        var middleware = new SecurityHeadersMiddleware(ctx =>
        {
            cspWhenNextRuns = ctx.Response.Headers["Content-Security-Policy"].ToString();
            return Task.CompletedTask;
        });

        var context = new DefaultHttpContext();
        await middleware.InvokeAsync(context);

        cspWhenNextRuns.Should().Be("default-src 'self'; frame-ancestors 'none'");
    }
}
