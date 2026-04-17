using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.PopulationHealth.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class PopHealthEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public PopHealthEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<PopHealthDbContext, PopHealthDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetRisks_Empty_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/population-health/risks");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetRisk_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/population-health/risks/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetCareGaps_Empty_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/population-health/care-gaps");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetStats_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/population-health/stats");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
