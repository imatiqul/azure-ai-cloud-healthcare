using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Domain.Voice;
using HealthQCopilot.Tests.Integration.Fixtures;
using HealthQCopilot.Voice.Infrastructure;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class VoiceEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public VoiceEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<VoiceDbContext, VoiceDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateSession_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetGuid().Should().NotBeEmpty();
        doc.RootElement.GetProperty("status").GetInt32().Should().Be((int)VoiceSessionStatus.Live);
    }

    [Fact]
    public async Task GetSession_AfterCreate_ReturnsSession()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/voice/sessions/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetSession_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/voice/sessions/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task EndSession_ReturnsEnded()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsync(
            $"/api/v1/voice/sessions/{id}/end", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetInt32().Should().Be((int)VoiceSessionStatus.Ended);
    }

    [Fact]
    public async Task ProduceTranscript_ReturnsOk()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/voice/sessions/{id}/transcript",
            new { TranscriptText = "Patient reports chest pain and difficulty breathing" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListSessions_ReturnsOk()
    {
        await _client.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });

        var response = await _client.GetAsync("/api/v1/voice/sessions");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
