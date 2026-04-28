using Aspire.Hosting.Testing;
using Xunit;

namespace HealthQCopilot.Tests.AppHost;

/// <summary>
/// Verifies the Aspire AppHost resource model without starting any containers.
/// These tests inspect the distributed application graph at build-time only.
/// </summary>
public sealed class AppHostTests
{
    [Fact]
    public async Task AppHost_RegistersAllMicroservices()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HealthQCopilot_AppHost>();

        var names = builder.Resources.Select(r => r.Name).ToArray();

        Assert.Contains("identity-service", names);
        Assert.Contains("voice-service", names);
        Assert.Contains("agent-service", names);
        Assert.Contains("fhir-service", names);
        Assert.Contains("ocr-service", names);
        Assert.Contains("scheduling-service", names);
        Assert.Contains("notification-service", names);
        Assert.Contains("pophealth-service", names);
        Assert.Contains("revenue-service", names);
        Assert.Contains("gateway", names);
        Assert.Contains("bff", names);
    }

    [Fact]
    public async Task AppHost_RegistersAllMfes()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HealthQCopilot_AppHost>();

        var names = builder.Resources.Select(r => r.Name).ToArray();

        Assert.Contains("shell", names);
        Assert.Contains("voice-mfe", names);
        Assert.Contains("triage-mfe", names);
        Assert.Contains("scheduling-mfe", names);
        Assert.Contains("pophealth-mfe", names);
        Assert.Contains("revenue-mfe", names);
        Assert.Contains("encounters-mfe", names);
        Assert.Contains("engagement-mfe", names);
    }

    [Fact]
    public async Task AppHost_RegistersInfrastructureResources()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HealthQCopilot_AppHost>();

        var names = builder.Resources.Select(r => r.Name).ToArray();

        Assert.Contains("postgres", names);
        Assert.Contains("redis", names);
        Assert.Contains("hapi-fhir", names);
        Assert.Contains("qdrant", names);
        Assert.Contains("dapr-placement", names);
    }

    [Fact]
    public async Task AppHost_RegistersAllNineDatabases()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HealthQCopilot_AppHost>();

        var names = builder.Resources.Select(r => r.Name).ToArray();

        Assert.Contains("voice-db", names);
        Assert.Contains("agent-db", names);
        Assert.Contains("fhir-db", names);
        Assert.Contains("ocr-db", names);
        Assert.Contains("scheduling-db", names);
        Assert.Contains("notification-db", names);
        Assert.Contains("pophealth-db", names);
        Assert.Contains("identity-db", names);
        Assert.Contains("revenue-db", names);
    }

    [Fact]
    public async Task AppHost_TotalResourceCount_IsComplete()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HealthQCopilot_AppHost>();

        // 11 microservices (9 + gateway + bff)
        // + 8 MFEs
        // + 9 databases
        // + postgres + redis + hapi-fhir + qdrant + sql-servicebus + servicebus-emulator + dapr-placement + pgadmin
        Assert.True(builder.Resources.Count >= 35,
            $"Expected at least 35 resources in the AppHost graph, but found {builder.Resources.Count}.");
    }
}
