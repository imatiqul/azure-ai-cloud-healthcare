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

using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Persistence;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// <see cref="PhiAuditMiddleware"/> inside a real request pipeline: the framework's own
/// authentication and authorization middleware, in the order the services register them, behind
/// the tenant-context middleware that reads <c>X-User-Id</c> into the log scope, with a test
/// scheme that takes the caller from an <c>Authorization: Test &lt;subject&gt;</c> header.
/// Spec 004-audit-identity, AC-002 to AC-004.
/// </summary>
public sealed class PhiAuditPipelineTests
{
    private const string TestScheme = "Test";
    private const string PhiPath = "/api/v1/patients/42";

    // ── Helpers ───────────────────────────────────────────────────────────────

    private sealed record Pipeline(
        RequestDelegate Run, ServiceProvider Services, RecordingEventHub Events, CapturingLoggerProvider Log);

    /// <summary>
    /// Builds authentication, the audit middleware and authorization in the given order, in
    /// front of an endpoint that answers 200.
    /// </summary>
    private static Pipeline Build(bool auditBeforeAuthentication = false)
    {
        var dbName = Guid.NewGuid().ToString(); // one database per pipeline, so tests share no rows
        var events = new RecordingEventHub();
        var log = new CapturingLoggerProvider();
        var services = new ServiceCollection();
        services.AddLogging(logging => logging.AddProvider(log));
        services.AddRouting(); // the authorization middleware resolves its policy cache from routing's services
        services.AddDbContext<AuditDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton<IEventHubAuditService>(events);
        services.AddAuthentication(TestScheme)
            .AddScheme<AuthenticationSchemeOptions, HeaderSubjectHandler>(TestScheme, _ => { });
        services.AddAuthorization();
        var provider = services.BuildServiceProvider();

        var app = new ApplicationBuilder(provider);
        app.UseMiddleware<TenantContextMiddleware>(); // the only code in the product that reads X-User-Id
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

        return new Pipeline(app.Build(), provider, events, log);
    }

    /// <summary>Sends one request through the pipeline and returns the response status.</summary>
    private static async Task<int> SendAsync(
        Pipeline pipeline,
        string? authorization = null,
        bool guarded = true,
        Action<HttpRequest>? configure = null,
        string? requiredRole = null)
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
            ? new EndpointMetadataCollection(new AuthorizeAttribute { Roles = requiredRole })
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

    /// <summary>
    /// The event stream is the second copy of the record: one event for each row, naming the
    /// same user with the same status.
    /// </summary>
    private static void EventsShouldMatch(Pipeline pipeline, List<PhiAuditLog> entries)
    {
        var published = pipeline.Events.Published
            .Select(e => $"{e.UserId} {e.HttpStatusCode}")
            .Order(StringComparer.Ordinal);
        var recorded = entries
            .Select(e => $"{e.UserId} {e.StatusCode}")
            .Order(StringComparer.Ordinal);

        string.Join(" | ", published).Should().Be(string.Join(" | ", recorded));
    }

    // ── AC-002: the record names the token's subject ──────────────────────────

    [Fact]
    public async Task ValidToken_TheRecordNamesTheTokensSubject()
    {
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: "Test Clinician-7B");

        status.Should().Be(StatusCodes.Status200OK);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be("Clinician-7B", "a subject is recorded exactly as the token carries it");
        entries[0].StatusCode.Should().Be(StatusCodes.Status200OK);
        entries[0].ResourcePath.Should().Be(PhiPath);
        EventsShouldMatch(pipeline, entries);
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
        EventsShouldMatch(pipeline, entries);

        // The header reaches the log scope through the tenant-context middleware. The lines the
        // audit middleware writes name the user of the record all the same.
        var lines = pipeline.Log.Lines;
        lines.Should().HaveCount(2);
        lines[0].Should().StartWith("PHI_ACCESS: User=user-u ");
        lines[1].Should().StartWith("PHI_ACCESS_COMPLETE: User=user-u ");
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
        entries[0].UserId.Should().Be("(unauthenticated)");
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        EventsShouldMatch(pipeline, entries);
    }

    [Theory]
    [InlineData("Bearer not-a-token-this-scheme-knows")]
    [InlineData("Test")]
    [InlineData("")]
    public async Task ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated(string authorization)
    {
        // The scheme finds nothing it can read. This is the path a request with no token takes.
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: authorization);

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        EventsShouldMatch(pipeline, entries);
    }

    [Theory]
    [InlineData("Test expired:clinician-7")]
    [InlineData("Test malformed:%%%")]
    public async Task ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated(string authorization)
    {
        // The scheme reads the token and fails it, as the bearer handler does with an expired or
        // a malformed one. The subject the rejected token claims is not recorded.
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: authorization);

        status.Should().Be(StatusCodes.Status401Unauthorized);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entries[0].StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        EventsShouldMatch(pipeline, entries);
    }

    [Fact]
    public async Task ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject()
    {
        // The record that shows a signed-in person trying a door: 403, and their own subject.
        var pipeline = Build();

        var status = await SendAsync(pipeline, authorization: "Test clinician-7", requiredRole: "PlatformAdmin");

        status.Should().Be(StatusCodes.Status403Forbidden);
        var entries = await EntriesAsync(pipeline);
        entries.Should().ContainSingle();
        entries[0].UserId.Should().Be("clinician-7");
        entries[0].StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        EventsShouldMatch(pipeline, entries);
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
        EventsShouldMatch(pipeline, entries);
        pipeline.Log.Lines.Should().HaveCount(2);
        pipeline.Log.Lines[1].Should().StartWith("PHI_ACCESS_COMPLETE: User=(unauthenticated) ");
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
        EventsShouldMatch(pipeline, entries);
    }

    [Fact]
    public async Task TwoCallers_EachRecordNamesItsOwnCaller()
    {
        var pipeline = Build();

        await SendAsync(pipeline, authorization: "Test user-a");
        await SendAsync(pipeline, authorization: "Test user-b");

        var entries = await EntriesAsync(pipeline, expected: 2);
        entries.Select(e => e.UserId).Should().BeEquivalentTo("user-a", "user-b");
        EventsShouldMatch(pipeline, entries);
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
        EventsShouldMatch(pipeline, entries);
    }

    // ── What the pipeline writes besides the row ──────────────────────────────

    /// <summary>Stands where the Event Hubs publisher stands in a service, and keeps what it is given.</summary>
    private sealed class RecordingEventHub : IEventHubAuditService
    {
        private readonly List<AuditEvent> _published = [];

        public IReadOnlyList<AuditEvent> Published
        {
            get
            {
                lock (_published)
                    return [.. _published];
            }
        }

        public Task PublishAsync(AuditEvent evt, CancellationToken ct = default)
        {
            lock (_published)
                _published.Add(evt);
            return Task.CompletedTask;
        }
    }

    /// <summary>Keeps the text of every line the audit middleware logs.</summary>
    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly List<string> _lines = [];

        public IReadOnlyList<string> Lines
        {
            get
            {
                lock (_lines)
                    return [.. _lines];
            }
        }

        public ILogger CreateLogger(string categoryName) => new Capture(this, categoryName);

        public void Dispose() => GC.SuppressFinalize(this);

        private sealed class Capture(CapturingLoggerProvider owner, string category) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state)
                where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(
                LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                if (!category.EndsWith(nameof(PhiAuditMiddleware), StringComparison.Ordinal))
                    return;
                lock (owner._lines)
                    owner._lines.Add(formatter(state, exception));
            }
        }
    }

    // ── The test scheme ───────────────────────────────────────────────────────

    /// <summary>
    /// Authenticates <c>Authorization: Test &lt;subject&gt;</c>. A subject that starts with
    /// <c>expired:</c> or <c>malformed:</c> is a token the scheme reads and rejects; anything
    /// else is no identity.
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
            if (subject.StartsWith("expired:", StringComparison.Ordinal)
                || subject.StartsWith("malformed:", StringComparison.Ordinal))
                return Task.FromResult(AuthenticateResult.Fail("The scheme rejects this token."));

            var identity = new ClaimsIdentity([new Claim("sub", subject)], TestScheme);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), TestScheme);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
