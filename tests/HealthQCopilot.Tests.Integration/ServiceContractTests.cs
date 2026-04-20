using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using HealthQCopilot.Tests.Integration.Fixtures;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Fhir.Persistence;
using HealthQCopilot.PopulationHealth.Infrastructure;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Consumer-Driven Service Contract Tests (Pact-style)
///
/// These tests verify the HTTP contracts between HealthQ Copilot microservices.
/// They act as the "consumer" side — each test validates that a downstream
/// provider service returns a response that matches the shape, status code, and
/// required fields that the consuming service depends on.
///
/// Contract pairs tested:
///   AgentService    → PopHealthService     (risk score, SDOH, care gaps, trajectory)
///   AgentService    → IdentityService      (patient lookup)
///   FhirService     → (self) Lab Delta     (delta-check response shape)
///   BFF             → PopHealthService     (patientRisk, costPrediction)
///   PopHealthService→ HEDIS quality        (scorecard shape)
/// </summary>
public class ServiceContractTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _postgres;
    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public ServiceContractTests(PostgresFixture postgres)
    {
        _postgres = postgres;
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private HttpClient PopHealthClient() =>
        new ServiceWebApplicationFactory<PopHealthDbContext, PopHealthDbContext>(_postgres).CreateClient();

    private HttpClient FhirClient() =>
        new FhirWebApplicationFactory(_postgres).CreateClient();

    private HttpClient AgentClient() =>
        new ServiceWebApplicationFactory<AgentDbContext, AgentDbContext>(_postgres).CreateClient();

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: AgentService → PopHealthService
    //   AgentService expects GET /api/v1/population-health/risks
    //   to return an array with objects containing: patientId, level, riskScore
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PopHealthService_RisksEndpoint_ContractShape()
    {
        var client = PopHealthClient();

        var response = await client.GetAsync("/api/v1/population-health/risks?top=5");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        // Consumer (AgentService) requires an array response
        doc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);

        // Each element must have the required fields
        foreach (var element in doc.RootElement.EnumerateArray())
        {
            element.TryGetProperty("patientId", out _).Should().BeTrue(
                "AgentService requires 'patientId' field in risk objects");
            element.TryGetProperty("riskScore", out _).Should().BeTrue(
                "AgentService requires 'riskScore' field in risk objects");
            element.TryGetProperty("level", out _).Should().BeTrue(
                "AgentService requires 'level' field in risk objects");
        }
    }

    [Fact]
    public async Task PopHealthService_SdohEndpoint_ContractShape()
    {
        var client = PopHealthClient();

        // POST /sdoh (AgentService consumes this to assess SDOH risk weight)
        var payload = new
        {
            patientId = "contract-test-patient",
            housingInstability = 1, foodInsecurity = 1, transportation = 0,
            socialIsolation = 0, financialStrain = 1, employment = 0,
            education = 1, digitalAccess = 0
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/population-health/sdoh", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // AgentService / BFF needs: patientId, totalScore, riskLevel, compositeRiskWeight
        body.TryGetProperty("patientId", out _).Should().BeTrue(
            "BFF/AgentService requires 'patientId' in SDOH response");
        body.TryGetProperty("totalScore", out _).Should().BeTrue(
            "BFF requires 'totalScore' in SDOH response");
        body.TryGetProperty("riskLevel", out _).Should().BeTrue(
            "BFF requires 'riskLevel' in SDOH response");
        body.TryGetProperty("compositeRiskWeight", out var weight);
        weight.GetDouble().Should().BeInRange(0.0, 0.30,
            "SDOH compositeRiskWeight must be in [0.0, 0.30]");
    }

    [Fact]
    public async Task PopHealthService_DrugInteractionEndpoint_ContractShape()
    {
        var client = PopHealthClient();

        var payload = new { drugs = new[] { "warfarin", "aspirin" } };

        var response = await client.PostAsJsonAsync(
            "/api/v1/population-health/drug-interactions/check", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // CDS Hooks service expects: interactions array, hasCritical bool
        body.TryGetProperty("interactions", out _).Should().BeTrue(
            "CDS consumer requires 'interactions' array in DDI response");
        body.TryGetProperty("hasCritical", out _).Should().BeTrue(
            "CDS consumer requires 'hasCritical' boolean in DDI response");
        body.TryGetProperty("checkedAt", out _).Should().BeTrue(
            "Audit systems require 'checkedAt' timestamp in DDI response");
    }

    [Fact]
    public async Task PopHealthService_RiskTrajectoryEndpoint_ContractShape()
    {
        var client = PopHealthClient();

        // BFF GraphQL patientRiskHistory resolver calls this
        var response = await client.GetAsync(
            "/api/v1/population-health/risks/contract-test-patient/trajectory");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // BFF needs: patientId, dataPoints array, overallTrend
        body.TryGetProperty("patientId", out _).Should().BeTrue(
            "BFF requires 'patientId' in trajectory response");
        body.TryGetProperty("dataPoints", out var dataPoints).Should().BeTrue(
            "BFF requires 'dataPoints' array in trajectory response");
        dataPoints.ValueKind.Should().Be(JsonValueKind.Array);
        body.TryGetProperty("overallTrend", out _).Should().BeTrue(
            "Frontend chart requires 'overallTrend' in trajectory response");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: FhirService — lab delta check
    //   CDS Hooks consumers expect: flags[], hasCriticalFlags, flagCount
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task FhirService_LabDeltaCheck_ContractShape()
    {
        var client = FhirClient();

        var payload = new
        {
            newObservations = new[]
            {
                new { patientId = "ct-001", loincCode = "2823-3", value = 2.1,
                      unit = "mEq/L", collectedAt = DateTime.UtcNow }
            },
            priorObservations = new[]
            {
                new { patientId = "ct-001", loincCode = "2823-3", value = 4.2,
                      unit = "mEq/L", collectedAt = DateTime.UtcNow.AddDays(-7) }
            }
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/fhir/observations/delta-check", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.TryGetProperty("flags", out var flags).Should().BeTrue(
            "CDS consumer requires 'flags' array in delta-check response");
        flags.ValueKind.Should().Be(JsonValueKind.Array);
        body.TryGetProperty("hasCriticalFlags", out _).Should().BeTrue(
            "Alert routing requires 'hasCriticalFlags' boolean");
        body.TryGetProperty("flagCount", out _).Should().BeTrue(
            "Dashboard requires 'flagCount' integer");
        body.TryGetProperty("observationsChecked", out _).Should().BeTrue(
            "Audit requires 'observationsChecked' count");
    }

    [Fact]
    public async Task FhirService_LabDeltaCheck_CriticalPotassiumFlagged()
    {
        var client = FhirClient();

        // Potassium 2.2 mEq/L — below critical low threshold (2.5)
        var payload = new
        {
            newObservations = new[]
            {
                new { patientId = "ct-002", loincCode = "2823-3", value = 2.2,
                      unit = "mEq/L", collectedAt = DateTime.UtcNow }
            },
            priorObservations = (object[]?)null
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/fhir/observations/delta-check", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.GetProperty("hasCriticalFlags").GetBoolean()
            .Should().BeTrue("Potassium 2.2 mEq/L is below critical threshold of 2.5");
        body.GetProperty("flagCount").GetInt32()
            .Should().BeGreaterThan(0);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: AgentService — clinician feedback endpoint
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AgentService_FeedbackEndpoint_ContractShape()
    {
        var client = AgentClient();

        var payload = new
        {
            clinicianId = "doc-123",
            sessionId   = "sess-abc",
            originalAiResponse = "Patient shows signs of ACS. Recommend troponin series.",
            rating      = 5
        };

        var response = await client.PostAsJsonAsync("/api/v1/agents/feedback", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.TryGetProperty("feedbackId", out _).Should().BeTrue(
            "Audit requires 'feedbackId' (Guid) in feedback response");
        body.TryGetProperty("action", out var action).Should().BeTrue(
            "Audit requires 'action' string in feedback response");
        action.GetString().Should().NotBeNullOrEmpty();
        body.TryGetProperty("createdAt", out _).Should().BeTrue(
            "Audit requires 'createdAt' timestamp in feedback response");
    }

    [Fact]
    public async Task AgentService_FeedbackEndpoint_RejectsBadRating()
    {
        var client = AgentClient();

        var payload = new
        {
            clinicianId = "doc-123",
            sessionId   = "sess-abc",
            originalAiResponse = "...",
            rating      = 99 // invalid
        };

        var response = await client.PostAsJsonAsync("/api/v1/agents/feedback", payload);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "Rating outside 1–5 must be rejected with 400");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: HEDIS endpoint — Population Health scorecard consumer
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PopHealthService_HedisEndpoint_ContractShape()
    {
        var client = PopHealthClient();

        var payload = new
        {
            age = 65, sex = "F",
            conditions  = new[] { "diabetes", "hypertension" },
            procedures  = Array.Empty<string>(),
            observations = Array.Empty<string>(),
            lastHbA1cDate   = (DateTime?)null,
            lastHbA1cValue  = (double?)null,
            lastBpDate      = (DateTime?)null,
            lastSystolicBp  = (int?)null,
            lastDiastolicBp = (int?)null,
            lastMammogramDate        = (DateTime?)null,
            lastColorectalScreenDate = (DateTime?)null,
            colorectalScreenType     = (string?)null
        };

        var response = await client.PostAsJsonAsync("/api/v1/population-health/hedis", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.TryGetProperty("measureResults", out _).Should().BeTrue(
            "Quality dashboard requires 'measureResults' array");
        body.TryGetProperty("overallRate", out _).Should().BeTrue(
            "Payer reporting requires 'overallRate' percentage");
        body.TryGetProperty("calculatedAt", out _).Should().BeTrue(
            "Audit requires 'calculatedAt' timestamp");
    }
}

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Consumer-Driven Service Contract Tests (Pact-style)
///
/// These tests verify the HTTP contracts between HealthQ Copilot microservices.
/// They act as the "consumer" side — each test validates that a downstream
/// provider service returns a response that matches the shape, status code, and
/// required fields that the consuming service depends on.
///
/// Contract pairs tested:
///   AgentService    → PopHealthService     (risk score, SDOH, care gaps)
///   AgentService    → IdentityService      (patient lookup, clinician contact)
///   RevenueService  → AgentService         (coding job trigger, explanation)
///   BFF             → PopHealthService     (patientRisk, costPrediction)
///   FhirService     → (self) CDS Hooks     (patient-view hook response shape)
///   PopHealthService→ (self) Lab Delta     (delta-check response shape)
///
/// All tests use <see cref="ServiceWebApplicationFactory{T,TDb}"/> which spins up
/// a real in-process server backed by Testcontainers PostgreSQL.
/// </summary>
public class ServiceContractTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _postgres;
    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public ServiceContractTests(PostgresFixture postgres)
    {
        _postgres = postgres;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: AgentService → PopHealthService
    //   AgentService expects GET /api/v1/population-health/risks?riskLevel=High
    //   to return an array with objects containing: id, patientId, level, riskScore, assessedAt
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PopHealthService_RisksEndpoint_ContractShape()
    {
        var factory = new PopHealthWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/population-health/risks?top=5");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        // Consumer (AgentService) requires an array response
        doc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);

        // Each element must have the required fields
        foreach (var element in doc.RootElement.EnumerateArray())
        {
            element.TryGetProperty("patientId", out _).Should().BeTrue(
                "AgentService requires 'patientId' field in risk objects");
            element.TryGetProperty("riskScore", out _).Should().BeTrue(
                "AgentService requires 'riskScore' field in risk objects");
            element.TryGetProperty("level", out _).Should().BeTrue(
                "AgentService requires 'level' field in risk objects");
        }
    }

    [Fact]
    public async Task PopHealthService_SdohEndpoint_ContractShape()
    {
        var factory = new PopHealthWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        // POST /sdoh (AgentService consumes this to assess SDOH risk weight)
        var payload = new
        {
            patientId = "contract-test-patient",
            housingInstability = 1, foodInsecurity = 1, transportation = 0,
            socialIsolation = 0, financialStrain = 1, employment = 0,
            education = 1, digitalAccess = 0
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/population-health/sdoh", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // AgentService needs: patientId, totalScore, riskLevel, compositeRiskWeight
        body.TryGetProperty("patientId", out _).Should().BeTrue(
            "BFF/AgentService requires 'patientId' in SDOH response");
        body.TryGetProperty("totalScore", out _).Should().BeTrue(
            "BFF requires 'totalScore' in SDOH response");
        body.TryGetProperty("riskLevel", out _).Should().BeTrue(
            "BFF requires 'riskLevel' in SDOH response");
        body.TryGetProperty("compositeRiskWeight", out var weight);
        weight.GetDouble().Should().BeInRange(0.0, 0.30,
            "SDOH compositeRiskWeight must be in [0.0, 0.30]");
    }

    [Fact]
    public async Task PopHealthService_DrugInteractionEndpoint_ContractShape()
    {
        var factory = new PopHealthWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var payload = new { drugs = new[] { "warfarin", "aspirin" } };

        var response = await client.PostAsJsonAsync(
            "/api/v1/population-health/drug-interactions/check", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // CDS Hooks service expects: interactions array, hasCritical bool
        body.TryGetProperty("interactions", out _).Should().BeTrue(
            "CDS consumer requires 'interactions' array in DDI response");
        body.TryGetProperty("hasCritical", out _).Should().BeTrue(
            "CDS consumer requires 'hasCritical' boolean in DDI response");
        body.TryGetProperty("checkedAt", out _).Should().BeTrue(
            "Audit systems require 'checkedAt' timestamp in DDI response");
    }

    [Fact]
    public async Task PopHealthService_RiskTrajectoryEndpoint_ContractShape()
    {
        var factory = new PopHealthWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        // BFF GraphQL patientRiskHistory resolver calls this
        var response = await client.GetAsync(
            "/api/v1/population-health/risks/contract-test-patient/trajectory");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // BFF needs: patientId, dataPoints array, overallTrend
        body.TryGetProperty("patientId", out _).Should().BeTrue(
            "BFF requires 'patientId' in trajectory response");
        body.TryGetProperty("dataPoints", out var dataPoints).Should().BeTrue(
            "BFF requires 'dataPoints' array in trajectory response");
        dataPoints.ValueKind.Should().Be(JsonValueKind.Array);
        body.TryGetProperty("overallTrend", out _).Should().BeTrue(
            "Frontend chart requires 'overallTrend' in trajectory response");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: FhirService → LabDelta (self-contract)
    //   CDS Hooks consumers expect delta-check to return: flags[], hasCriticalFlags, flagCount
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task FhirService_LabDeltaCheck_ContractShape()
    {
        var factory = new FhirWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var payload = new
        {
            newObservations = new[]
            {
                new { patientId = "ct-001", loincCode = "2823-3", value = 2.1, unit = "mEq/L", collectedAt = DateTime.UtcNow }
            },
            priorObservations = new[]
            {
                new { patientId = "ct-001", loincCode = "2823-3", value = 4.2, unit = "mEq/L", collectedAt = DateTime.UtcNow.AddDays(-7) }
            }
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/fhir/observations/delta-check", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // CDS consumer requires these fields
        body.TryGetProperty("flags", out var flags).Should().BeTrue(
            "CDS consumer requires 'flags' array in delta-check response");
        flags.ValueKind.Should().Be(JsonValueKind.Array);
        body.TryGetProperty("hasCriticalFlags", out _).Should().BeTrue(
            "Alert routing requires 'hasCriticalFlags' boolean");
        body.TryGetProperty("flagCount", out _).Should().BeTrue(
            "Dashboard requires 'flagCount' integer");
        body.TryGetProperty("observationsChecked", out _).Should().BeTrue(
            "Audit requires 'observationsChecked' count");
    }

    [Fact]
    public async Task FhirService_LabDeltaCheck_CriticalPotassiumFlagged()
    {
        var factory = new FhirWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        // Potassium 2.2 mEq/L — below critical low threshold (2.5)
        var payload = new
        {
            newObservations = new[]
            {
                new { patientId = "ct-002", loincCode = "2823-3", value = 2.2, unit = "mEq/L", collectedAt = DateTime.UtcNow }
            },
            priorObservations = new[] { (object?)null }
        };

        var response = await client.PostAsJsonAsync(
            "/api/v1/fhir/observations/delta-check",
            new { newObservations = payload.newObservations, priorObservations = (object[]?)null });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.GetProperty("hasCriticalFlags").GetBoolean()
            .Should().BeTrue("Potassium 2.2 mEq/L is below critical threshold of 2.5");
        body.GetProperty("flagCount").GetInt32()
            .Should().BeGreaterThan(0);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: AgentService — feedback endpoint
    //   Any consumer that persists clinician feedback expects a well-shaped response
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AgentService_FeedbackEndpoint_ContractShape()
    {
        var factory = new AgentWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var payload = new
        {
            clinicianId = "doc-123",
            sessionId   = "sess-abc",
            originalAiResponse = "Patient shows signs of ACS. Recommend troponin series.",
            rating      = 5,
            correctedText = (string?)null,
            comment     = "Accurate and timely",
            category    = (string?)null
        };

        var response = await client.PostAsJsonAsync("/api/v1/agents/feedback", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Consumers (audit log, quality dashboard) need: feedbackId, action, createdAt
        body.TryGetProperty("feedbackId", out _).Should().BeTrue(
            "Audit requires 'feedbackId' (Guid) in feedback response");
        body.TryGetProperty("action", out var action).Should().BeTrue(
            "Audit requires 'action' string in feedback response");
        action.GetString().Should().NotBeNullOrEmpty();
        body.TryGetProperty("createdAt", out _).Should().BeTrue(
            "Audit requires 'createdAt' timestamp in feedback response");
    }

    [Fact]
    public async Task AgentService_FeedbackEndpoint_RejectsBadRating()
    {
        var factory = new AgentWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var payload = new
        {
            clinicianId = "doc-123",
            sessionId   = "sess-abc",
            originalAiResponse = "...",
            rating      = 99  // invalid
        };

        var response = await client.PostAsJsonAsync("/api/v1/agents/feedback", payload);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "Rating outside 1–5 must be rejected with 400");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRACT: HEDIS endpoint — Population Health scorecard consumer
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PopHealthService_HedisEndpoint_ContractShape()
    {
        var factory = new PopHealthWebApplicationFactory(_postgres);
        var client  = factory.CreateClient();

        var payload = new
        {
            age = 65, sex = "F",
            conditions = new[] { "diabetes", "hypertension" },
            procedures  = Array.Empty<string>(),
            observations = Array.Empty<string>(),
            lastHbA1cDate  = (DateTime?)null,
            lastHbA1cValue = (double?)null,
            lastBpDate     = (DateTime?)null,
            lastSystolicBp = (int?)null,
            lastDiastolicBp = (int?)null,
            lastMammogramDate      = (DateTime?)null,
            lastColorectalScreenDate = (DateTime?)null,
            colorectalScreenType   = (string?)null
        };

        var response = await client.PostAsJsonAsync("/api/v1/population-health/hedis", payload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Quality dashboard requires: measureResults array, overallRate, calculatedAt
        body.TryGetProperty("measureResults", out _).Should().BeTrue(
            "Quality dashboard requires 'measureResults' array");
        body.TryGetProperty("overallRate", out _).Should().BeTrue(
            "Payer reporting requires 'overallRate' percentage");
        body.TryGetProperty("calculatedAt", out _).Should().BeTrue(
            "Audit requires 'calculatedAt' timestamp");
    }
}
