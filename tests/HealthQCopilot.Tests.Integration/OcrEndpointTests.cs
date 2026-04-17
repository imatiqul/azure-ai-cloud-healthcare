using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Ocr.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class OcrEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public OcrEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<OcrDbContext, OcrDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateJob_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/ocr/jobs", new
        {
            PatientId = Guid.NewGuid(),
            DocumentUrl = "https://storage.blob.core.windows.net/docs/test.pdf",
            DocumentType = "Lab Report"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetGuid().Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetJob_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/ocr/jobs/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetJob_AfterCreate_ReturnsJob()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/ocr/jobs", new
        {
            PatientId = Guid.NewGuid(),
            DocumentUrl = "https://storage.blob.core.windows.net/docs/test2.pdf",
            DocumentType = "Prescription"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/ocr/jobs/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListJobs_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/ocr/jobs");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
