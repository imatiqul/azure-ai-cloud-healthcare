using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.RevenueCycle.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class RevenueEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public RevenueEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<RevenueDbContext, RevenueDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateCodingJob_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/revenue/coding-jobs", new
        {
            EncounterId = "ENC-TEST-001",
            PatientId = "PAT-TEST-001",
            PatientName = "Test Patient",
            SuggestedCodes = new[] { "J06.9", "R05.9" }
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("encounterId").GetString().Should().Be("ENC-TEST-001");
    }

    [Fact]
    public async Task GetCodingJob_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/revenue/coding-jobs/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetCodingJob_AfterCreate_ReturnsJob()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/coding-jobs", new
        {
            EncounterId = "ENC-TEST-002",
            PatientId = "PAT-TEST-002",
            PatientName = "Another Patient",
            SuggestedCodes = new[] { "I10", "E11.65" }
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/revenue/coding-jobs/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListCodingJobs_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/coding-jobs");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task CreatePriorAuth_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/revenue/prior-auths", new
        {
            PatientId = "PAT-TEST-003",
            PatientName = "Auth Patient",
            Procedure = "Knee MRI",
            ProcedureCode = "73721",
            InsurancePayer = "Blue Cross"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("patientId").GetString().Should().Be("PAT-TEST-003");
    }

    [Fact]
    public async Task GetPriorAuth_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/revenue/prior-auths/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetStats_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/stats");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
