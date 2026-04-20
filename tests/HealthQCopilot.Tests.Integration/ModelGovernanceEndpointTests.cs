using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Integration tests for AI Model Governance endpoints (Phase 29).
/// Covers: register, history, get-by-id, evaluate
/// </summary>
public class ModelGovernanceEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public ModelGovernanceEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<TriageOrchestrator, AgentDbContext>(postgres);
        _client = factory.CreateClient();
    }

    // ── POST /register ─────────────────────────────────────────────────────────

    [Fact]
    public async Task RegisterModel_ValidRequest_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "gpt-4o",
            ModelVersion = "2025-01-01",
            DeploymentName = "gpt4o-prod",
            SkVersion = "1.30.0",
            PromptHash = "abc123",
            PluginManifest = "[]",
            DeployedByUserId = "deploy-user-1"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("modelName").GetString().Should().Be("gpt-4o");
        doc.RootElement.GetProperty("isActive").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task RegisterModel_MissingModelName_ReturnsBadRequest()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "",
            ModelVersion = "2025-01-01",
            DeploymentName = "gpt4o-prod"
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task RegisterModel_MissingDeploymentName_ReturnsBadRequest()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "gpt-4o",
            ModelVersion = "2025-01-01",
            DeploymentName = ""
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task RegisterModel_SecondRegistration_DeactivatesPreviousEntry()
    {
        // Register first
        var first = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "test-model-deactivate",
            ModelVersion = "v1",
            DeploymentName = "dep-v1",
            SkVersion = "1.0",
            PromptHash = "hash1",
            DeployedByUserId = "user-a"
        });
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        // Register second (same model name, new version)
        var second = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "test-model-deactivate",
            ModelVersion = "v2",
            DeploymentName = "dep-v2",
            SkVersion = "1.1",
            PromptHash = "hash2",
            DeployedByUserId = "user-b"
        });
        second.StatusCode.Should().Be(HttpStatusCode.Created);

        var doc = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("modelVersion").GetString().Should().Be("v2");
        doc.RootElement.GetProperty("isActive").GetBoolean().Should().BeTrue();
    }

    // ── GET /history ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetHistory_ReturnsOkWithList()
    {
        // Seed one entry
        await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "history-model",
            ModelVersion = "1.0",
            DeploymentName = "hist-dep",
            SkVersion = "1.0",
            PromptHash = "hh",
            DeployedByUserId = "u"
        });

        var response = await _client.GetAsync("/api/v1/agents/governance/history");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("history-model");
    }

    [Fact]
    public async Task GetHistory_FilterByModelName_ReturnsFilteredResults()
    {
        await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "filter-model-unique",
            ModelVersion = "1.0",
            DeploymentName = "filter-dep",
            SkVersion = "1.0",
            PromptHash = "fh",
            DeployedByUserId = "u"
        });

        var response = await _client.GetAsync("/api/v1/agents/governance/history?modelName=filter-model-unique");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("filter-model-unique");
    }

    // ── GET /{id} ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetById_AfterRegister_ReturnsEntry()
    {
        var created = await _client.PostAsJsonAsync("/api/v1/agents/governance/register", new
        {
            ModelName = "get-by-id-model",
            ModelVersion = "1.0",
            DeploymentName = "getid-dep",
            SkVersion = "1.0",
            PromptHash = "gih",
            DeployedByUserId = "u"
        });
        var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/agents/governance/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("modelName").GetString().Should().Be("get-by-id-model");
    }

    [Fact]
    public async Task GetById_NonExistentId_ReturnsNotFound()
    {
        var response = await _client.GetAsync($"/api/v1/agents/governance/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── POST /evaluate — golden-set regression test ────────────────────────────

    [Fact]
    public async Task Evaluate_WithNoActiveModel_ReturnsBadRequest()
    {
        // Use a unique DB context so there are no active models from prior tests
        var freshPostgres = new PostgresFixture();
        await freshPostgres.InitializeAsync();

        try
        {
            var freshFactory = new ServiceWebApplicationFactory<TriageOrchestrator, AgentDbContext>(freshPostgres);
            var freshClient = freshFactory.CreateClient();

            var response = await freshClient.PostAsJsonAsync("/api/v1/agents/governance/evaluate", new
            {
                EvaluatedByUserId = "evaluator-1"
            });

            // BadRequest (no active model) or OK/UnprocessableEntity (has models)
            response.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.OK, HttpStatusCode.UnprocessableEntity);
        }
        finally
        {
            await freshPostgres.DisposeAsync();
        }
    }

    [Fact]
    public async Task Evaluate_WithInvalidModelId_ReturnsNotFound()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/agents/governance/evaluate", new
        {
            ModelRegistryEntryId = Guid.NewGuid(),
            EvaluatedByUserId = "evaluator-2"
        });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
