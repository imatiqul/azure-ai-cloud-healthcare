using System.Security.Claims;
using System.Text.Encodings.Web;
using HealthQCopilot.Tests.Integration.Fixtures;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HealthQCopilot.Tests.Integration;

public class ServiceWebApplicationFactory<TProgram, TDbContext> : WebApplicationFactory<TProgram>
    where TProgram : class
    where TDbContext : DbContext
{
    private readonly PostgresFixture _postgres;

    public ServiceWebApplicationFactory(PostgresFixture postgres)
    {
        _postgres = postgres;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove existing DbContext registration
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<TDbContext>));
            if (descriptor != null) services.Remove(descriptor);

            // Remove hosted services that require external dependencies (Service Bus, etc.)
            services.RemoveAll(typeof(Microsoft.Extensions.Hosting.IHostedService));

            // Add fake authentication for integration tests
            services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            services.AddAuthorizationBuilder()
                .AddPolicy("Admin", p => p.RequireAuthenticatedUser())
                .AddPolicy("Clinician", p => p.RequireAuthenticatedUser())
                .AddPolicy("PlatformAdmin", p => p.RequireAuthenticatedUser());

            // Ensure IHttpClientFactory is registered for plugins
            services.AddHttpClient();

            // Register in-memory distributed cache for tests (replaces Aspire Redis)
            services.RemoveAll(typeof(IDistributedCache));
            services.AddDistributedMemoryCache();

            // Add test DbContext using Testcontainers Postgres
            services.AddDbContext<TDbContext>(options =>
                options.UseNpgsql(_postgres.ConnectionString));

            // Ensure database is created
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TDbContext>();
            db.Database.EnsureCreated();
        });

        builder.UseEnvironment("Testing");
    }
}

public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "test-user"),
            new Claim(ClaimTypes.NameIdentifier, "test-user-id"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(ClaimTypes.Role, "Clinician"),
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "Test");
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

internal static class ServiceCollectionExtensions
{
    public static void RemoveAll(this IServiceCollection services, Type serviceType)
    {
        var descriptors = services.Where(d => d.ServiceType == serviceType).ToList();
        foreach (var d in descriptors) services.Remove(d);
    }
}
