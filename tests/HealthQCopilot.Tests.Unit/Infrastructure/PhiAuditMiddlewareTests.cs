using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Persistence;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="PhiAuditMiddleware"/>.
/// Fire-and-forget persistence calls are given 150 ms to complete via Task.Delay;
/// an InMemory AuditDbContext (shared by name) is used to verify DB side-effects.
/// </summary>
public sealed class PhiAuditMiddlewareTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Builds a <see cref="PhiAuditMiddleware"/> backed by a uniquely-named
    /// InMemory <see cref="AuditDbContext"/> so tests do not share state.
    /// </summary>
    private static (PhiAuditMiddleware Sut, ILogger<PhiAuditMiddleware> Logger, string DbName)
        BuildSut(RequestDelegate? next = null, IEventHubAuditService? eventHub = null)
    {
        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddDbContext<AuditDbContext>(o => o.UseInMemoryDatabase(dbName));
        var sp = services.BuildServiceProvider();
        var scopeFactory = sp.GetRequiredService<IServiceScopeFactory>();
        var logger = Substitute.For<ILogger<PhiAuditMiddleware>>();

        var sut = new PhiAuditMiddleware(
            next ?? (ctx => { ctx.Response.StatusCode = 200; return Task.CompletedTask; }),
            logger,
            scopeFactory,
            eventHub);

        return (sut, logger, dbName);
    }

    /// <summary>Opens a fresh <see cref="AuditDbContext"/> over the InMemory database
    /// created by <see cref="BuildSut"/> so the fire-and-forget write can be queried.</summary>
    private static AuditDbContext OpenDb(string dbName)
    {
        var opts = new DbContextOptionsBuilder<AuditDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AuditDbContext(opts);
    }

    /// <summary>
    /// A request context. With <paramref name="subject"/> set, the request is authenticated
    /// and its token carries that subject in <paramref name="subjectClaimType"/>.
    /// </summary>
    private static DefaultHttpContext MakeContext(
        string path,
        string? subject = null,
        string method = "GET",
        int responseStatus = 200,
        string subjectClaimType = "sub")
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = path;
        ctx.Request.Method = method;
        ctx.Response.StatusCode = responseStatus;
        if (subject is not null)
        {
            ctx.User = new ClaimsPrincipal(
                new ClaimsIdentity([new Claim(subjectClaimType, subject)], "test"));
        }
        return ctx;
    }

    private static async Task<PhiAuditLog?> SingleEntryAsync(string dbName)
    {
        await Task.Delay(150); // let fire-and-forget persist to InMemory DB
        await using var db = OpenDb(dbName);
        return await db.PhiAuditLogs.SingleOrDefaultAsync();
    }

    // ── Non-PHI paths ─────────────────────────────────────────────────────────

    [Fact]
    public async Task NonPhiPath_CallsNextWithoutLogging()
    {
        var nextCalled = false;
        var (sut, logger, _) = BuildSut(next: _ => { nextCalled = true; return Task.CompletedTask; });

        await sut.InvokeAsync(MakeContext("/api/v1/health"));

        nextCalled.Should().BeTrue();
        logger.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task NonPhiPath_DoesNotPublishToEventHub()
    {
        var eventHub = Substitute.For<IEventHubAuditService>();
        var (sut, _, _) = BuildSut(eventHub: eventHub);

        await sut.InvokeAsync(MakeContext("/api/v1/health"));

        await eventHub.DidNotReceiveWithAnyArgs().PublishAsync(default!, default);
    }

    // ── PHI paths ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task PhiPath_AlwaysCallsNext()
    {
        var nextCalled = false;
        var (sut, _, _) = BuildSut(next: ctx =>
        {
            ctx.Response.StatusCode = 200;
            nextCalled = true;
            return Task.CompletedTask;
        });

        await sut.InvokeAsync(MakeContext("/api/v1/patients/123"));

        nextCalled.Should().BeTrue();
    }

    [Fact]
    public async Task PhiPath_LogsInformationTwice()
    {
        // Two LogInformation calls: PHI_ACCESS (before next) + PHI_ACCESS_COMPLETE (after next)
        var (sut, logger, _) = BuildSut();

        await sut.InvokeAsync(MakeContext("/api/v1/patients/123"));

        logger.ReceivedWithAnyArgs(2).Log(
            LogLevel.Information,
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            Arg.Any<Exception?>(),
            Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task PhiPath_CaseInsensitivePathMatching()
    {
        // "/API/V1/PATIENTS" must trigger audit just like "/api/v1/patients"
        var (sut, logger, _) = BuildSut();

        await sut.InvokeAsync(MakeContext("/API/V1/PATIENTS/123"));

        logger.ReceivedCalls().Should().NotBeEmpty("audit must fire for case-insensitive PHI path");
    }

    // ── Who the record names (spec 004-audit-identity) ───────────────────────

    [Fact]
    public async Task PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity()
    {
        var (sut, _, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/encounters/99", subject: "user-abc");

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be("user-abc");
    }

    [Fact]
    public async Task PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim()
    {
        // ASP.NET Core maps the token's "sub" to the name-identifier claim by default.
        var (sut, _, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/encounters/99", subject: "user-abc",
            subjectClaimType: ClaimTypes.NameIdentifier);

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be("user-abc");
    }

    [Fact]
    public async Task PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity()
    {
        var (sut, _, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/fhir/Patient/1"); // no authenticated identity

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        entry.UserId.Should().NotBe("anonymous", "the old placeholder named signed-in users and nobody alike");
    }

    [Fact]
    public async Task PhiPath_DoesNotTakeTheUserFromTheOidClaim()
    {
        // An authenticated identity with an object id and no subject: the record says so.
        // It does not fall back to another claim, and it is not "unauthenticated" either.
        var (sut, logger, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/encounters/99", subject: "object-id-123", subjectClaimType: "oid");

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be(PhiAuditMiddleware.NoSubjectUser);
        logger.ReceivedCalls()
            .Where(c => c.GetArguments()[0] is LogLevel.Warning)
            .Should().HaveCount(1, "a token with no subject is worth a warning");
    }

    [Fact]
    public async Task PhiPath_IgnoresAUserNamedInARequestHeader()
    {
        // AC-003: a valid token for U and an X-User-Id header naming V. The record names U.
        var (sut, _, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/patients/7", subject: "user-u");
        ctx.Request.Headers["X-User-Id"] = "user-v";

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be("user-u");
    }

    [Fact]
    public async Task PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity()
    {
        var (sut, _, dbName) = BuildSut();
        var ctx = MakeContext("/api/v1/patients/7");
        ctx.Request.Headers["X-User-Id"] = "user-v";

        await sut.InvokeAsync(ctx);

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
    }

    [Fact]
    public async Task PhiPath_RecordsTheIdentityThePipelineEndedWith()
    {
        // The identity is read after the rest of the pipeline has run, so a principal set
        // further down (a policy that authenticates with its own scheme) is the one recorded.
        var (sut, _, dbName) = BuildSut(next: ctx =>
        {
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "set-downstream")], "test"));
            ctx.Response.StatusCode = 200;
            return Task.CompletedTask;
        });

        await sut.InvokeAsync(MakeContext("/api/v1/patients/7"));

        var entry = await SingleEntryAsync(dbName);
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be("set-downstream");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveUserId_TreatsABlankSubjectAsNoSubject(string blank)
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", blank)], "test"));

        PhiAuditMiddleware.ResolveUserId(user).Should().Be(PhiAuditMiddleware.NoSubjectUser);
    }

    [Fact]
    public void ResolveUserId_TreatsAMissingPrincipalAsUnauthenticated()
    {
        PhiAuditMiddleware.ResolveUserId(null).Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
        PhiAuditMiddleware.ResolveUserId(new ClaimsPrincipal(new ClaimsIdentity()))
            .Should().Be(PhiAuditMiddleware.UnauthenticatedUser);
    }

    [Fact]
    public void ResolveUserId_PrefersTheSubClaimToTheMappedOne()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "mapped"), new Claim("sub", "raw")], "test"));

        PhiAuditMiddleware.ResolveUserId(user).Should().Be("raw");
    }

    [Fact]
    public async Task PhiPath_PersistsAuditEntryWithCorrectFields()
    {
        var (sut, _, dbName) = BuildSut(
            next: ctx => { ctx.Response.StatusCode = 201; return Task.CompletedTask; });
        var ctx = MakeContext("/api/v1/scheduling/bookings", subject: "doc-007", method: "POST");

        await sut.InvokeAsync(ctx);
        await Task.Delay(150);

        await using var db = OpenDb(dbName);
        var entry = await db.PhiAuditLogs.SingleOrDefaultAsync();
        entry.Should().NotBeNull();
        entry!.UserId.Should().Be("doc-007");
        entry.HttpMethod.Should().Be("POST");
        entry.ResourcePath.Should().Be("/api/v1/scheduling/bookings");
    }

    [Fact]
    public async Task PhiPath_PublishesToEventHubWhenPresent()
    {
        var eventHub = Substitute.For<IEventHubAuditService>();
        eventHub.PublishAsync(Arg.Any<AuditEvent>(), Arg.Any<CancellationToken>())
            .Returns(Task.CompletedTask);
        var (sut, _, _) = BuildSut(eventHub: eventHub);

        await sut.InvokeAsync(MakeContext("/api/v1/patients/123"));
        await Task.Delay(150); // let fire-and-forget schedule the publish

        await eventHub.Received(1).PublishAsync(
            Arg.Any<AuditEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PhiPath_DoesNotThrowWhenEventHubIsNull()
    {
        var (sut, _, _) = BuildSut(eventHub: null);

        var act = () => sut.InvokeAsync(MakeContext("/api/v1/voice/sessions"));
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task PhiPath_PersistenceExceptionIsSwallowedAndLogged()
    {
        // A scope factory that throws when CreateScope() is called simulates
        // the database being unavailable — the response must still complete and
        // the error must be logged rather than propagated.
        var brokenScopeFactory = Substitute.For<IServiceScopeFactory>();
        brokenScopeFactory.CreateScope()
            .Returns<IServiceScope>(_ => throw new InvalidOperationException("DB unavailable"));

        var logger = Substitute.For<ILogger<PhiAuditMiddleware>>();
        var sut = new PhiAuditMiddleware(
            ctx => { ctx.Response.StatusCode = 200; return Task.CompletedTask; },
            logger,
            brokenScopeFactory);

        await sut.InvokeAsync(MakeContext("/api/v1/revenue/coding-jobs"));
        await Task.Delay(150);

        // Filter received calls for Error level (there will also be 2 Info calls for PHI_ACCESS)
        logger.ReceivedCalls()
            .Where(c => c.GetArguments()[0] is LogLevel.Error)
            .Should().HaveCount(1, "persistence failure must be logged at Error level and only once");
    }
}
