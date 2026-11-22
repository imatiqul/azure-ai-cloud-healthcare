using System.Security.Claims;
using System.Text.Encodings.Web;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Persistence;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// <see cref="PhiAuditMiddleware"/> inside a real request pipeline: the framework's own
/// authentication and authorization middleware, in the order the services register them, with
/// a test scheme that takes the caller from an <c>Authorization: Test &lt;subject&gt;</c> header.
/// Spec 004-audit-identity, AC-002 to AC-004.
/// </summary>
public sealed class PhiAuditPipelineTests
{
    private const string TestScheme = "Test";
    private const string PhiPath = "/api/v1/patients/42";

    // ── Helpers ───────────────────────────────────────────────────────────────

    private sealed record Pipeline(RequestDelegate Run, ServiceProvider Services);

    /// <summary>
    /// Builds authentication, the audit middleware and authorization in the given order, in
    /// front of an endpoint that answers 200.
    /// </summary>
    private static Pipeline Build(bool auditBeforeAuthentication = false)
    {
        var dbName = Guid.NewGuid().ToString(); // one database per pipeline, so tests share no rows
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddRouting(); // the authorization middleware resolves its policy cache from routing's services
        services.AddDbContext<AuditDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddAuthentication(TestScheme)
            .AddScheme<AuthenticationSchemeOptions, HeaderSubjectHandler>(TestScheme, _ => { });
        services.AddAuthorization();
        var provider = services.BuildServiceProvider();

        var app = new ApplicationBuilder(provider);
        if (auditBeforeAuthentication)
            app.UseMiddleware<PhiAuditMiddleware>();
        app.UseAuthentication();
        if (!auditBeforeAuthentication)
            app.UseMiddleware<PhiAuditMiddleware>();
        app.UseAuthorization();
        app.Run(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        });

        return new Pipeline(app.Build(), provider);
    }

    /// <summary>Sends one request through the pipeline and returns the response status.</summary>
    private static async Task<int> SendAsync(
        Pipeline pipeline,
        string? authorization = null,
        bool guarded = true,
        Action<HttpRequest>? configure = null)
    {
        await using var scope = pipeline.Services.CreateAsyncScope();
        var ctx = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        ctx.Request.Method = HttpMethods.Get;
        ctx.Request.Path = PhiPath;
        if (authorization is not null)
            ctx.Request.Headers.Authorization = authorization;
        configure?.Invoke(ctx.Request);

        // What a guarded endpoint looks like to the authorization middleware.
        var metadata = guarded
            ? new EndpointMetadataCollection(new AuthorizeAttribute())
            : EndpointMetadataCollection.Empty;
        ctx.SetEndpoint(new Endpoint(_ => Task.CompletedTask, metadata, guarded ? "guarded" : "open"));

        await pipeline.Run(ctx);
        return ctx.Response.StatusCode;
    }

    /// <summary>
    /// The audit rows written so far, read through the service provider the middleware writes
    /// through. The middleware starts the write and does not await it, so this waits for the
    /// expected number of rows, then gives a late duplicate time to appear.
    /// </summary>
    private static async Task<List<PhiAuditLog>> EntriesAsync(Pipeline pipeline, int expected = 1)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            await using var scope = pipeline.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
            if (await db.PhiAuditLogs.CountAsync() >= expected)
                break;
            await Task.Delay(20);
        }

        await Task.Delay(50);
        await using var settled = pipeline.Services.CreateAsyncScope();
        return await settled.ServiceProvider.GetRequiredService<AuditDbContext>().PhiAuditLogs.ToListAsync();
    }

    // ── AC-002: the record names the token's subject ──────────────────────────

    [Fact]
    public async Task ValidToken_TheRecordNamesTheTokensSubject()
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: "Test clinician-7");

        status.Should().Be(StatusCodes.Status200OK);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be("clinician-7");
        entries[0].StatusCode.Should().Be(StatusCodes.Status200OK);
        entries[0].ResourcePath.Should().Be(PhiPath);
    }

    // ── AC-003: a header naming a user changes nothing ────────────────────────

    [Theory]
    [InlineData("user-v")] // another user
    [InlineData("")]       // nobody
    [InlineData("user-u")] // the caller
    public async Task ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject(string headerValue)
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: "Test user-u",
            configure: request => request.Headers["X-User-Id"] = headerValue);

        status.Should().Be(StatusCodes.Status200OK);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be("user-u");
    }

    // ── AC-004: a refused request is still recorded, marked as unauthenticated ─

    [Fact]
    public async Task NoToken_TheRequestIsRefusedAndStillRecorded()
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline);

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle("a refused request must not vanish from the trail");
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Theory]
    [InlineData("Bearer not-a-token-this-scheme-knows")]
    [InlineData("Test")]
    [InlineData("")]
    public async Task ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated(string authorization)
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: authorization);

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task AnExpiredToken_IsRefusedAndRecordedAsUnauthenticated()
    {
        // The scheme knows the token and rejects it, as the bearer handler does with an expired one.
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: "Test expired:clinician-7");

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated()
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline,
            configure: request => request.Headers["X-User-Id"] = "user-v");

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
    }

    // ── What the order does and does not change ───────────────────────────────

    [Fact]
    public async Task AnEndpointWithNoGuard_ServedWithoutAToken_IsRecordedAsUnauthenticatedWithItsStatus()
    {
        // The audit does not refuse anything. Where an endpoint has no guard (finding C2),
        // the trail shows a served request that nobody was authenticated for.
        var pipeline = Build();

        var status = await SendAsync(pipeline, guarded: false);

        status.Should().Be(StatusCodes.Status200OK);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status200OK);
    }

    [Fact]
    public async Task TwoCallers_EachRecordNamesItsOwnCaller()
    {
        var pipeline = Build();

        await SendAsync(pipeline, authorization: "Test user-a");
        await SendAsync(pipeline, authorization: "Test user-b");

        var entries = await EntriesAsync(pipeline, expected: 2);
        entries.Select(e => e.UserId).Should().BeEquivalentTo("user-a", "user-b");
    }

    [Fact]
    public async Task AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller()
    {
        // The old order. The record is written after the pipeline has run and names whoever
        // it authenticated, so a service in the wrong order no longer writes "nobody". The
        // order is still wrong, and RequestPipelineOrderTests fails the build for it.
        var pipeline = Build(auditBeforeAuthentication: true);

        var status = await SendAsync(pipeline, authorization: "Test clinician-7");

        status.Should().Be(StatusCodes.Status200OK);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be("clinician-7");
    }

    // ── The test scheme ───────────────────────────────────────────────────────

    /// <summary>
    /// Authenticates <c>Authorization: Test &lt;subject&gt;</c>. A subject that starts with
    /// <c>expired:</c> is a token the scheme rejects; anything else is no identity.
    /// </summary>
    private sealed class HeaderSubjectHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            const string prefix = TestScheme + " ";
            var header = Request.Headers.Authorization.ToString();
            if (!header.StartsWith(prefix, StringComparison.Ordinal) || header.Length == prefix.Length)
                return Task.FromResult(AuthenticateResult.NoResult());

            var subject = header[prefix.Length..];
            if (subject.StartsWith("expired:", StringComparison.Ordinal))
                return Task.FromResult(AuthenticateResult.Fail("The token has expired."));

            var identity = new ClaimsIdentity([new Claim("sub", subject)], TestScheme);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), TestScheme);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
