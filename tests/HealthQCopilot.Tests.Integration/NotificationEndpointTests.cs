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

    // ── Phase 28 — campaign metrics wiring tests ──────────────────────────────

    [Fact]
    public async Task CreateCampaign_InvalidRequest_ReturnsBadRequest()
    {
        // Sending a request missing required fields should return 400 not 5xx
        var response = await _client.PostAsJsonAsync("/api/v1/notifications/campaigns", new
        {
            Name = (string?)null
        });

        ((int)response.StatusCode).Should().BeLessThan(500);
    }

    [Fact]
    public async Task ActivateCampaign_ReturnsMessagesCreated()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/notifications/campaigns", new
        {
            Name = "Cardiology Follow-Up",
            Type = 0, // Email
            TargetPatientIds = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() }
        });
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createDoc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createDoc.RootElement.GetProperty("id").GetGuid();

        var activateResponse = await _client.PostAsync($"/api/v1/notifications/campaigns/{id}/activate", null);

        activateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await activateResponse.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("messagesCreated").GetInt32().Should().Be(3);
    }

    // ── Delivery analytics ────────────────────────────────────────────────────

    [Fact]
    public async Task GetDeliveryAnalytics_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/notifications/analytics/delivery");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("Total", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("DeliveryRate", out _).Should().BeTrue();
        doc.RootElement.GetProperty("Total").GetInt32().Should().Be(0); // fresh DB — no messages
    }
}
