using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Integration tests for the self-driven demo system.
///
/// Covers:
///   • POST /api/v1/agents/demo/start             — start demo (with and without audienceGroup)
///   • POST /api/v1/agents/demo/{id}/next         — advance step
///   • POST /api/v1/agents/demo/{id}/feedback     — step feedback
///   • POST /api/v1/agents/demo/{id}/complete     — NPS completion with audienceGroup
///   • GET  /api/v1/agents/demo/{id}/status       — status polling
///   • GET  /api/v1/demo/kpi/audience             — Phase 71 audience-group KPI endpoint (all 5 groups)
///   • GET  /api/v1/platform/health               — platform health overview
///   • GET  /api/v1/kpi                           — business KPI metrics
///   • POST /api/v1/demo/scene-event              — scene event telemetry with audienceGroup
/// </summary>
public class DemoEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public DemoEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<AgentDbContext, AgentDbContext>(postgres);
        _client = factory.CreateClient();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Start Demo
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task StartDemo_WithoutAudienceGroup_Returns201()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/demo/start", new
        {
            clientName = "Integration Test User",
            company = "TestCo",
            email = "it@testco.com",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("sessionId", out var sid).Should().BeTrue("response must include sessionId");
        sid.GetGuid().Should().NotBeEmpty();
        doc.RootElement.TryGetProperty("currentStep", out _).Should().BeTrue("response must include currentStep");
        doc.RootElement.TryGetProperty("narration", out _).Should().BeTrue("response must include narration");
    }

    [Theory]
    [InlineData("patients")]
    [InlineData("practitioners")]
    [InlineData("clinics")]
    [InlineData("leadership")]
    [InlineData("full")]
    public async Task StartDemo_WithAudienceGroup_Returns201(string audienceGroup)
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/demo/start", new
        {
            clientName = $"Test — {audienceGroup}",
            company = "AudienceCo",
            email = $"{audienceGroup}@demo.test",
            audienceGroup,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created,
            $"StartDemo should succeed for audience group '{audienceGroup}'");

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("sessionId", out _).Should().BeTrue();
    }

    [Fact]
    public async Task StartDemo_InvalidPayload_Returns400()
    {
        // Missing required clientName
        var response = await _client.PostAsJsonAsync("/api/v1/agents/demo/start", new
        {
            company = "NoCo",
        });

        // Validation layer should reject — 400 or 422
        ((int)response.StatusCode).Should().BeOneOf(new[] { 400, 422 },
            "missing clientName should produce a validation error");
    }

    // ══════════════════════════════════════════════════════════════════════
    // Advance Step
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AdvanceStep_AfterStart_Returns200()
    {
        var sessionId = await StartDemoSessionAsync();

        var response = await _client.PostAsync($"/api/v1/agents/demo/{sessionId}/next", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("currentStep", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("narration", out _).Should().BeTrue();
    }

    [Fact]
    public async Task AdvanceStep_ThoughAllSteps_EventuallyCompletes()
    {
        var sessionId = await StartDemoSessionAsync();

        // Advance through all 6 steps until isCompleted is true
        bool completed = false;
        for (int i = 0; i < 8; i++) // max 8 advances (more than 6 steps as safety margin)
        {
            var res = await _client.PostAsync($"/api/v1/agents/demo/{sessionId}/next", null);
            if (!res.IsSuccessStatusCode) break;

            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("isCompleted", out var ic) && ic.GetBoolean())
            {
                completed = true;
                break;
            }
        }

        completed.Should().BeTrue("advancing through all demo steps should reach completion");
    }

    [Fact]
    public async Task AdvanceStep_UnknownSession_Returns404()
    {
        var response = await _client.PostAsync($"/api/v1/agents/demo/{Guid.NewGuid()}/next", null);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step Feedback
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task SubmitStepFeedback_ValidPayload_Returns200()
    {
        var sessionId = await StartDemoSessionAsync();

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/agents/demo/{sessionId}/feedback", new
            {
                step = "Welcome",
                rating = 4,
                tags = new[] { "Clear", "Engaging" },
                comment = "Great intro",
            });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task SubmitStepFeedback_InvalidStep_Returns400()
    {
        var sessionId = await StartDemoSessionAsync();

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/agents/demo/{sessionId}/feedback", new
            {
                step = "NonExistentStep",
                rating = 3,
                tags = Array.Empty<string>(),
            });

        ((int)response.StatusCode).Should().BeOneOf(400, 422);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Complete Demo — Phase 71: audienceGroup in completion payload
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task CompleteDemo_WithNpsAndAudienceGroup_Returns200()
    {
        var sessionId = await StartDemoSessionAsync();
        // Advance through all steps so completion is valid
        for (int i = 0; i < 8; i++)
        {
            var adv = await _client.PostAsync($"/api/v1/agents/demo/{sessionId}/next", null);
            if (!adv.IsSuccessStatusCode) break;
            var doc = JsonDocument.Parse(await adv.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("isCompleted", out var ic) && ic.GetBoolean()) break;
        }

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/agents/demo/{sessionId}/complete", new
            {
                npsScore = 9,
                featurePriorities = new[] { "Voice AI", "AI Triage" },
                comment = "Impressive demo",
                audienceGroup = "practitioners",           // Phase 71
            });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.TryGetProperty("npsScore", out var nps).Should().BeTrue();
        nps.GetInt32().Should().Be(9);
    }

    [Fact]
    public async Task CompleteDemo_WithoutAudienceGroup_StillSucceeds()
    {
        var sessionId = await StartDemoSessionAsync();
        for (int i = 0; i < 8; i++)
        {
            var adv = await _client.PostAsync($"/api/v1/agents/demo/{sessionId}/next", null);
            if (!adv.IsSuccessStatusCode) break;
            var doc = JsonDocument.Parse(await adv.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("isCompleted", out var ic) && ic.GetBoolean()) break;
        }

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/agents/demo/{sessionId}/complete", new
            {
                npsScore = 7,
                featurePriorities = new[] { "Smart Scheduling" },
                comment = (string?)null,
                // audienceGroup intentionally omitted — should default gracefully
            });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Status
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetStatus_AfterStart_Returns200()
    {
        var sessionId = await StartDemoSessionAsync();

        var response = await _client.GetAsync($"/api/v1/agents/demo/{sessionId}/status");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("sessionId", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("status", out _).Should().BeTrue();
    }

    [Fact]
    public async Task GetStatus_UnknownSession_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/agents/demo/{Guid.NewGuid()}/status");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Phase 71 — Audience-group KPI endpoint
    // ══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("patients")]
    [InlineData("practitioners")]
    [InlineData("clinics")]
    [InlineData("leadership")]
    [InlineData("full")]
    public async Task AudienceKpi_KnownGroup_Returns200WithProofPoints(string group)
    {
        var response = await _client.GetAsync($"/api/v1/demo/kpi/audience?group={group}");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            $"audience KPI endpoint should return 200 for group '{group}'");

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("group", out var g).Should().BeTrue("must return 'group' field");
        doc.RootElement.TryGetProperty("groupName", out _).Should().BeTrue("must return 'groupName' field");
        doc.RootElement.TryGetProperty("proofPoints", out var pp).Should().BeTrue("must return 'proofPoints' array");
        doc.RootElement.TryGetProperty("highlights", out var hl).Should().BeTrue("must return 'highlights' array");

        g.GetString().Should().Be(group);
        pp.ValueKind.Should().Be(JsonValueKind.Array);
        pp.GetArrayLength().Should().BeGreaterThan(0, "at least one proof point expected");

        // Each proof point must have stat + label
        foreach (var point in pp.EnumerateArray())
        {
            point.TryGetProperty("stat", out _).Should().BeTrue("proof point must have 'stat'");
            point.TryGetProperty("label", out _).Should().BeTrue("proof point must have 'label'");
        }

        hl.ValueKind.Should().Be(JsonValueKind.Array);
        hl.GetArrayLength().Should().BeGreaterThan(0, "at least one highlight expected");
    }

    [Fact]
    public async Task AudienceKpi_NoGroup_ReturnsFallbackFullPlatform()
    {
        // Missing ?group= should fall back to "full" platform stats
        var response = await _client.GetAsync("/api/v1/demo/kpi/audience");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("group", out var g).Should().BeTrue();
        g.GetString().Should().Be("full");
    }

    [Fact]
    public async Task AudienceKpi_UnknownGroup_ReturnsFallbackFullPlatform()
    {
        var response = await _client.GetAsync("/api/v1/demo/kpi/audience?group=unknown-group");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "unknown group should gracefully fall back to 'full' platform stats");
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("group", out var g).Should().BeTrue();
        g.GetString().Should().Be("full");
    }

    // ══════════════════════════════════════════════════════════════════════
    // Platform health + Business KPIs
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PlatformHealth_Returns200WithServices()
    {
        var response = await _client.GetAsync("/api/v1/platform/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
        doc.RootElement.GetArrayLength().Should().BeGreaterThan(0);

        // Spot-check first entry has required fields
        var first = doc.RootElement[0];
        first.TryGetProperty("service", out _).Should().BeTrue();
        first.TryGetProperty("status", out _).Should().BeTrue();
        first.TryGetProperty("latencyMs", out _).Should().BeTrue();
    }

    [Fact]
    public async Task BusinessKpi_Returns200WithMetrics()
    {
        var response = await _client.GetAsync("/api/v1/kpi");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.ValueKind.Should().Be(JsonValueKind.Object);
        // Sanity-check a few well-known fields
        doc.RootElement.TryGetProperty("triageAccuracy", out _).Should().BeTrue("triageAccuracy must be present");
        doc.RootElement.TryGetProperty("noShowReduction", out _).Should().BeTrue("noShowReduction must be present");
    }

    // ══════════════════════════════════════════════════════════════════════
    // Scene event telemetry — Phase 71: includes audienceGroup
    // ══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("patients")]
    [InlineData("practitioners")]
    [InlineData(null)]   // no audience group — legacy path
    public async Task SceneEvent_WithAudienceGroup_Returns200OrCreated(string? audienceGroup)
    {
        var body = new Dictionary<string, object?>
        {
            ["sessionId"] = Guid.NewGuid().ToString(),
            ["workflowId"] = "voice-intake",
            ["sceneIndex"] = 0,
            ["eventType"] = "scene_start",
            ["durationSec"] = 30,
            ["audienceGroup"] = audienceGroup,    // Phase 71 — may be null
            ["clientName"] = "IT User",
            ["company"] = "TestOrg",
        };

        var response = await _client.PostAsJsonAsync("/api/v1/demo/scene-event", body);

        ((int)response.StatusCode).Should().BeOneOf(new[] { 200, 201, 204 },
            "scene event telemetry should be accepted regardless of audienceGroup");
    }

    // ══════════════════════════════════════════════════════════════════════
    // Helper
    // ══════════════════════════════════════════════════════════════════════

    private async Task<Guid> StartDemoSessionAsync(string audienceGroup = "full")
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/demo/start", new
        {
            clientName = "Integration Helper",
            company = "HelperCo",
            email = "helper@helperco.test",
            audienceGroup,
        });

        response.EnsureSuccessStatusCode();
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("sessionId").GetGuid();
    }
}
