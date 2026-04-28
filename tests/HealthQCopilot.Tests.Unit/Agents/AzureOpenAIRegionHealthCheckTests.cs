using FluentAssertions;
using HealthQCopilot.ServiceDefaults.HealthChecks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

public class AzureOpenAIRegionHealthCheckTests
{
    private static AzureOpenAIRegionHealthCheck Build(Dictionary<string, string?> values)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new AzureOpenAIRegionHealthCheck(config);
    }

    [Fact]
    public async Task Returns_healthy_when_no_endpoint_configured()
    {
        var check = Build(new Dictionary<string, string?>());

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Description.Should().Contain("not configured");
    }

    [Fact]
    public async Task Returns_healthy_when_allow_list_empty()
    {
        var check = Build(new Dictionary<string, string?>
        {
            ["AzureOpenAI:Endpoint"] = "https://contoso.eastus2.openai.azure.com/",
            ["AzureOpenAI:Region"]   = "eastus2",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Description.Should().Contain("allow-list not enforced");
    }

    [Fact]
    public async Task Returns_healthy_when_explicit_region_in_allow_list()
    {
        var check = Build(new Dictionary<string, string?>
        {
            ["AzureOpenAI:Endpoint"]            = "https://contoso.openai.azure.com/",
            ["AzureOpenAI:Region"]              = "eastus2",
            ["AzureOpenAI:AllowedRegions:0"]    = "eastus2",
            ["AzureOpenAI:AllowedRegions:1"]    = "westus3",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Data["region"].Should().Be("eastus2");
    }

    [Fact]
    public async Task Returns_unhealthy_when_region_outside_allow_list()
    {
        var check = Build(new Dictionary<string, string?>
        {
            ["AzureOpenAI:Endpoint"]            = "https://contoso.openai.azure.com/",
            ["AzureOpenAI:Region"]              = "swedencentral",
            ["AzureOpenAI:AllowedRegions:0"]    = "eastus2",
            ["AzureOpenAI:AllowedRegions:1"]    = "westus3",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Unhealthy);
        result.Description.Should().Contain("swedencentral");
        result.Description.Should().Contain("data-residency");
    }

    [Fact]
    public async Task Returns_degraded_when_region_cannot_be_resolved_from_endpoint()
    {
        var check = Build(new Dictionary<string, string?>
        {
            // No region label embedded in host (3 labels — "contoso.openai.azure.com")
            // and no explicit AzureOpenAI:Region setting.
            ["AzureOpenAI:Endpoint"]         = "https://contoso.openai.azure.com/",
            ["AzureOpenAI:AllowedRegions:0"] = "eastus2",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Degraded);
        result.Description.Should().Contain("AzureOpenAI:Region");
    }

    [Fact]
    public async Task Parses_region_from_custom_domain_host()
    {
        var check = Build(new Dictionary<string, string?>
        {
            ["AzureOpenAI:Endpoint"]         = "https://contoso.eastus2.openai.azure.com/",
            ["AzureOpenAI:AllowedRegions:0"] = "eastus2",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Data["region"].Should().Be("eastus2");
    }

    [Fact]
    public async Task Parses_region_from_cognitiveservices_custom_domain()
    {
        var check = Build(new Dictionary<string, string?>
        {
            ["AzureOpenAI:Endpoint"]         = "https://contoso.westeurope.cognitiveservices.azure.com/",
            ["AzureOpenAI:AllowedRegions:0"] = "westeurope",
        });

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Data["region"].Should().Be("westeurope");
    }
}
