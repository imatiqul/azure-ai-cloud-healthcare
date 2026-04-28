using FluentAssertions;
using HealthQCopilot.Infrastructure.Startup;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Unit tests for <see cref="StartupValidationService"/>.
///
/// All tests that verify "should pass" scenarios use Development environment so the
/// Dapr sidecar check (which reads a process-level env var) is bypassed.
/// Tests that specifically exercise the Dapr check explicitly save/restore
/// DAPR_HTTP_PORT to avoid interference with other tests.
/// </summary>
public sealed class StartupValidationServiceTests
{
    // ── helpers ──────────────────────────────────────────────────────────────

    private static IConfiguration BuildConfig(
        IEnumerable<KeyValuePair<string, string?>> pairs) =>
        new ConfigurationBuilder().AddInMemoryCollection(pairs).Build();

    private static ILogger<StartupValidationService> MockLogger() =>
        Substitute.For<ILogger<StartupValidationService>>();

    private static IHostEnvironment MockEnv(bool isDevelopment)
    {
        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(
            isDevelopment ? Environments.Development : Environments.Production);
        return env;
    }

    // ── passing scenarios ─────────────────────────────────────────────────────

    [Fact]
    public async Task ValidConfig_WithAppDbConnectionString_PassesValidation()
    {
        var config = BuildConfig([
            new("ConnectionStrings:AppDb", "Server=localhost;Database=appdb")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task ValidConfig_WithAlternateConnectionStringKey_PassesValidation()
    {
        // ValidateAny accepts any one of the 12 known DB keys — test AgentDb
        var config = BuildConfig([
            new("ConnectionStrings:AgentDb", "Server=localhost;Database=agentdb")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task AzureOpenAI_EndpointAndDeploymentNameBothSet_Passes()
    {
        var config = BuildConfig([
            new("ConnectionStrings:AppDb", "Server=localhost"),
            new("AzureOpenAI:Endpoint", "https://myopenai.openai.azure.com/"),
            new("AzureOpenAI:DeploymentName", "gpt-4o")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task ValidAppConfigUri_Passes()
    {
        var config = BuildConfig([
            new("ConnectionStrings:AppDb", "Server=localhost"),
            new("AppConfig:Endpoint", "https://healthq.azconfig.io")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task Development_MissingDaprPort_Passes()
    {
        // In Development the Dapr env-var check is skipped entirely
        var saved = Environment.GetEnvironmentVariable("DAPR_HTTP_PORT");
        Environment.SetEnvironmentVariable("DAPR_HTTP_PORT", null);
        try
        {
            var config = BuildConfig([
                new("ConnectionStrings:AppDb", "Server=localhost")
            ]);

            var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

            await svc.Invoking(s => s.StartAsync(CancellationToken.None))
                .Should().NotThrowAsync();
        }
        finally
        {
            Environment.SetEnvironmentVariable("DAPR_HTTP_PORT", saved);
        }
    }

    // ── failing scenarios ─────────────────────────────────────────────────────

    [Fact]
    public async Task MissingAllDbConnectionStrings_ThrowsInvalidOperationException()
    {
        var config = BuildConfig([]);   // no connection strings at all

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*configuration error*");
    }

    [Fact]
    public async Task AzureOpenAI_EndpointSetWithoutDeploymentName_Fails()
    {
        var config = BuildConfig([
            new("ConnectionStrings:AppDb", "Server=localhost"),
            new("AzureOpenAI:Endpoint", "https://myopenai.openai.azure.com/")
            // AzureOpenAI:DeploymentName intentionally absent
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*configuration error*");
    }

    [Fact]
    public async Task InvalidAppConfigUri_Fails()
    {
        var config = BuildConfig([
            new("ConnectionStrings:AppDb", "Server=localhost"),
            new("AppConfig:Endpoint", "not-a-valid-absolute-uri")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*configuration error*");
    }

    [Fact]
    public async Task NonDevelopment_MissingDaprPort_Fails()
    {
        var saved = Environment.GetEnvironmentVariable("DAPR_HTTP_PORT");
        Environment.SetEnvironmentVariable("DAPR_HTTP_PORT", null);
        try
        {
            var config = BuildConfig([
                new("ConnectionStrings:AppDb", "Server=localhost")
            ]);

            var svc = new StartupValidationService(config, MockEnv(isDevelopment: false), MockLogger());

            await svc.Invoking(s => s.StartAsync(CancellationToken.None))
                .Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*configuration error*");
        }
        finally
        {
            Environment.SetEnvironmentVariable("DAPR_HTTP_PORT", saved);
        }
    }

    [Fact]
    public async Task MultipleErrors_ExceptionMessageContainsCount()
    {
        // No DB connection string (1 error) + invalid AppConfig URI (1 error) = 2 errors
        var config = BuildConfig([
            new("AppConfig:Endpoint", "bad-uri")
        ]);

        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        var assertion = await svc.Invoking(s => s.StartAsync(CancellationToken.None))
            .Should().ThrowAsync<InvalidOperationException>();

        // The message is: "...due to N configuration error(s)..."
        assertion.Which.Message.Should().Contain("2");
    }

    // ── lifecycle ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task StopAsync_AlwaysCompletes()
    {
        var config = BuildConfig([new("ConnectionStrings:AppDb", "Server=localhost")]);
        var svc = new StartupValidationService(config, MockEnv(isDevelopment: true), MockLogger());

        await svc.Invoking(s => s.StopAsync(CancellationToken.None))
            .Should().NotThrowAsync();
    }
}
