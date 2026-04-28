using System.Diagnostics.Metrics;
using System.Text;
using FluentAssertions;
using HealthQCopilot.Infrastructure.Metrics;
using HealthQCopilot.Infrastructure.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="IdempotencyMiddleware"/>.
///
/// Verifies that duplicate POST requests are deduplicated via a distributed cache
/// keyed on X-Idempotency-Key, that only 2xx responses are cached, and that
/// non-POST methods and non-protected paths bypass the idempotency logic entirely.
/// </summary>
public sealed class IdempotencyMiddlewareTests
{
    // ── helpers ───────────────────────────────────────────────────────────────

    private static ILogger<IdempotencyMiddleware> MockLogger() =>
        Substitute.For<ILogger<IdempotencyMiddleware>>();

    /// <summary>
    /// Creates a BusinessMetrics backed by an NSubstitute IMeterFactory that
    /// returns a real Meter (instruments are created but no exporter is attached).
    /// </summary>
    private static BusinessMetrics CreateMetrics()
    {
        var factory = Substitute.For<IMeterFactory>();
        factory.Create(Arg.Any<MeterOptions>()).Returns(_ => new Meter("healthq.test." + Guid.NewGuid()));
        return new BusinessMetrics(factory);
    }

    /// <summary>
    /// Serialized form of the IdempotencyEntry private record that the middleware
    /// writes to and reads from the distributed cache. Property names must be
    /// PascalCase to match System.Text.Json default serialization.
    /// </summary>
    private static byte[] CacheEntry(int statusCode, string body) =>
        Encoding.UTF8.GetBytes(
            $$$"""{"StatusCode":{{{statusCode}}},"ContentType":"application/json","ResponseBody":"{{{body.Replace("\"", "\\\"")}}}"}""");

    // ── bypass scenarios ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetRequest_BypassesIdempotencyCheck()
    {
        bool nextCalled = false;
        var cache = Substitute.For<IDistributedCache>();

        var middleware = new IdempotencyMiddleware(
            _ => { nextCalled = true; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "GET";
        ctx.Request.Path = "/api/v1/agents/triage";
        ctx.Request.Headers["X-Idempotency-Key"] = "key-123";

        await middleware.InvokeAsync(ctx);

        nextCalled.Should().BeTrue("GET requests must not be intercepted");
        await cache.DidNotReceive().GetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PostToNonProtectedPath_BypassesIdempotencyCheck()
    {
        bool nextCalled = false;
        var cache = Substitute.For<IDistributedCache>();

        var middleware = new IdempotencyMiddleware(
            _ => { nextCalled = true; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/diagnostics/healthz";   // not in IdempotentPaths
        ctx.Request.Headers["X-Idempotency-Key"] = "key-123";

        await middleware.InvokeAsync(ctx);

        nextCalled.Should().BeTrue("non-protected paths must pass through");
        await cache.DidNotReceive().GetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PostWithoutIdempotencyKeyHeader_BypassesIdempotencyCheck()
    {
        bool nextCalled = false;
        var cache = Substitute.For<IDistributedCache>();

        var middleware = new IdempotencyMiddleware(
            _ => { nextCalled = true; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/agents/triage";
        // No X-Idempotency-Key header

        await middleware.InvokeAsync(ctx);

        nextCalled.Should().BeTrue("requests with no idempotency key must pass through");
        await cache.DidNotReceive().GetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    // ── cache-hit scenario ────────────────────────────────────────────────────

    [Fact]
    public async Task CacheHit_ReturnsCachedResponse_NextIsNotInvoked()
    {
        bool nextCalled = false;
        var cache = Substitute.For<IDistributedCache>();

        // Return a valid serialized IdempotencyEntry (StatusCode=200, body={"ok":true})
        cache.GetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
             .Returns(CacheEntry(200, @"{ok:true}"));

        var middleware = new IdempotencyMiddleware(
            _ => { nextCalled = true; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/agents/triage";
        ctx.Request.Headers["X-Idempotency-Key"] = "duplicate-key";

        await middleware.InvokeAsync(ctx);

        nextCalled.Should().BeFalse("cached response must be returned without executing next()");
        ctx.Response.StatusCode.Should().Be(200);
    }

    // ── cache-miss scenarios ──────────────────────────────────────────────────

    [Fact]
    public async Task CacheMiss_2xxResponse_IsStoredInCache()
    {
        var cache = Substitute.For<IDistributedCache>();
        // cache miss — GetAsync returns null (NSubstitute default for unconfigured calls)

        var middleware = new IdempotencyMiddleware(
            ctx =>
            {
                ctx.Response.StatusCode = 201;
                ctx.Response.ContentType = "application/json";
                return ctx.Response.Body.WriteAsync(
                    Encoding.UTF8.GetBytes("""{"id":"abc"}""")).AsTask();
            },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/agents/triage";
        ctx.Request.Headers["X-Idempotency-Key"] = "new-key-001";

        await middleware.InvokeAsync(ctx);

        // The 2xx response must have been stored in the cache
        await cache.Received(1).SetAsync(
            Arg.Any<string>(),
            Arg.Any<byte[]>(),
            Arg.Any<DistributedCacheEntryOptions>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CacheMiss_4xxResponse_IsNotStoredInCache()
    {
        var cache = Substitute.For<IDistributedCache>();
        // cache miss

        var middleware = new IdempotencyMiddleware(
            ctx =>
            {
                ctx.Response.StatusCode = 400;
                return Task.CompletedTask;
            },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/agents/triage";
        ctx.Request.Headers["X-Idempotency-Key"] = "failed-key";

        await middleware.InvokeAsync(ctx);

        // Non-2xx responses must NOT be cached (client should retry)
        await cache.DidNotReceive().SetAsync(
            Arg.Any<string>(),
            Arg.Any<byte[]>(),
            Arg.Any<DistributedCacheEntryOptions>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CacheMiss_NextIsAlwaysInvoked()
    {
        bool nextCalled = false;
        var cache = Substitute.For<IDistributedCache>();

        var middleware = new IdempotencyMiddleware(
            _ => { nextCalled = true; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = "/api/v1/voice/sessions";
        ctx.Request.Headers["X-Idempotency-Key"] = "fresh-key";

        await middleware.InvokeAsync(ctx);

        nextCalled.Should().BeTrue("on a cache miss the inner pipeline must always execute");
    }

    // ── cache key structure ───────────────────────────────────────────────────

    [Fact]
    public async Task DifferentPaths_UseDistinctCacheKeys()
    {
        // Two requests with the SAME idempotency key but DIFFERENT paths must
        // consult different cache entries — preventing cross-endpoint replay attacks.
        var capturedKeys = new List<string>();
        var cache = Substitute.For<IDistributedCache>();
        cache.GetAsync(
            Arg.Do<string>(k => capturedKeys.Add(k)),
            Arg.Any<CancellationToken>())
            .Returns((byte[]?)null);

        var middleware = new IdempotencyMiddleware(
            ctx => { ctx.Response.StatusCode = 200; return Task.CompletedTask; },
            cache, CreateMetrics(), MockLogger());

        var key = "shared-idempotency-key";

        var ctx1 = new DefaultHttpContext();
        ctx1.Request.Method = "POST";
        ctx1.Request.Path = "/api/v1/agents/triage";
        ctx1.Request.Headers["X-Idempotency-Key"] = key;

        var ctx2 = new DefaultHttpContext();
        ctx2.Request.Method = "POST";
        ctx2.Request.Path = "/api/v1/voice/sessions";
        ctx2.Request.Headers["X-Idempotency-Key"] = key;

        await middleware.InvokeAsync(ctx1);
        await middleware.InvokeAsync(ctx2);

        capturedKeys.Should().HaveCount(2);
        capturedKeys[0].Should().NotBe(capturedKeys[1],
            "the same idempotency key on different paths must produce different cache keys");
    }
}
