using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Notifications.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class NotificationEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public NotificationEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<NotificationDbContext, NotificationDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateCampaign_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/notifications/campaigns", new
        {
            Name = "Flu Shot Reminder",
            Type = 0, // Email
            TargetPatientIds = new[] { Guid.NewGuid(), Guid.NewGuid() }
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetGuid().Should().NotBeEmpty();
    }

    [Fact]
    public async Task ListCampaigns_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/notifications/campaigns");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ActivateCampaign_AfterCreate_ReturnsOk()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/notifications/campaigns", new
        {
            Name = "Wellness Check",
            Type = 1, // Sms
            TargetPatientIds = new[] { Guid.NewGuid() }
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsync($"/api/v1/notifications/campaigns/{id}/activate", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListMessages_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/notifications/messages");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
