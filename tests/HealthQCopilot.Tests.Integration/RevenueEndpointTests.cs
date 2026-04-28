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

    // ── Coding Jobs ──────────────────────────────────────────────────────────

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
        doc.RootElement.GetProperty("status").GetString().Should().Be("Pending");
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
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("encounterId").GetString().Should().Be("ENC-TEST-002");
    }

    [Fact]
    public async Task ListCodingJobs_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/coding-jobs");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task ReviewCodingJob_AfterCreate_MovesToInReview()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/coding-jobs", new
        {
            EncounterId = "ENC-REVIEW-001",
            PatientId = "PAT-REVIEW-001",
            PatientName = "Review Patient",
            SuggestedCodes = new[] { "Z00.00" }
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var reviewResponse = await _client.PostAsJsonAsync(
            $"/api/v1/revenue/coding-jobs/{id}/review",
            new { ApprovedCodes = new[] { "Z00.00" }, ReviewedBy = "Dr. Smith" });

        reviewResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await reviewResponse.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("InReview");
    }

    [Fact]
    public async Task ReviewCodingJob_NotFound_Returns404()
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/revenue/coding-jobs/{Guid.NewGuid()}/review",
            new { ApprovedCodes = new[] { "Z00.00" }, ReviewedBy = "Dr. Smith" });
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task SubmitCodingJob_AfterReview_MovesToSubmitted()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/coding-jobs", new
        {
            EncounterId = "ENC-SUBMIT-001",
            PatientId = "PAT-SUBMIT-001",
            PatientName = "Submit Patient",
            SuggestedCodes = new[] { "E11.9" }
        });
        var createDoc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createDoc.RootElement.GetProperty("id").GetGuid();

        // Review first
        await _client.PostAsJsonAsync(
            $"/api/v1/revenue/coding-jobs/{id}/review",
            new { ApprovedCodes = new[] { "E11.9" }, ReviewedBy = "Dr. Jones" });

        // Then submit
        var submitResponse = await _client.PostAsync(
            $"/api/v1/revenue/coding-jobs/{id}/submit", null);

        submitResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await submitResponse.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Submitted");
    }

    // ── Prior Authorizations ──────────────────────────────────────────────────

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
        doc.RootElement.GetProperty("status").GetString().Should().Be("Draft");
    }

    [Fact]
    public async Task ListPriorAuths_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/prior-auths");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task GetPriorAuth_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/revenue/prior-auths/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetPriorAuth_AfterCreate_ReturnsAuth()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/prior-auths", new
        {
            PatientId = "PAT-PA-001",
            PatientName = "PA Patient",
            Procedure = "CT Chest",
            ProcedureCode = "71250",
            InsurancePayer = "Aetna"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/revenue/prior-auths/{id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("procedure").GetString().Should().Be("CT Chest");
    }

    [Fact]
    public async Task SubmitPriorAuth_AfterCreate_MovesToSubmitted()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/prior-auths", new
        {
            PatientId = "PAT-PA-SUBMIT",
            PatientName = "Submit PA Patient",
            Procedure = "MRI Brain",
            ProcedureCode = "70553",
            InsurancePayer = "UnitedHealth"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsync($"/api/v1/revenue/prior-auths/{id}/submit", null);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Submitted");
    }

    [Fact]
    public async Task ApprovePriorAuth_AfterSubmit_MovesToApproved()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/prior-auths", new
        {
            PatientId = "PAT-PA-APPROVE",
            PatientName = "Approve PA Patient",
            Procedure = "Knee Arthroscopy",
            ProcedureCode = "29881",
            InsurancePayer = "Cigna"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        await _client.PostAsync($"/api/v1/revenue/prior-auths/{id}/submit", null);

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/revenue/prior-auths/{id}/approve",
            new { AuthorizationNumber = "AUTH-2026-001", ApprovedBy = "Payer Review" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Approved");
    }

    [Fact]
    public async Task DenyPriorAuth_AfterSubmit_MovesToDenied()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/revenue/prior-auths", new
        {
            PatientId = "PAT-PA-DENY",
            PatientName = "Deny PA Patient",
            Procedure = "Hip Replacement",
            ProcedureCode = "27130",
            InsurancePayer = "Humana"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        await _client.PostAsync($"/api/v1/revenue/prior-auths/{id}/submit", null);

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/revenue/prior-auths/{id}/deny",
            new { Reason = "Not medically necessary", DenialCode = "CO-50" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Denied");
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetStats_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/stats");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("codingQueue", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("priorAuthsPending", out _).Should().BeTrue();
    }

    // ── Denial Management ─────────────────────────────────────────────────────

    [Fact]
    public async Task ListDenials_Empty_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/denials/");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task GetDenial_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/revenue/denials/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetDenialAnalytics_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/denials/analytics");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.TryGetProperty("totalOpen", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("overturnRate", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("byCategory", out _).Should().BeTrue();
    }

    // ── Claims ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ListClaims_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/v1/revenue/claims");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array);
    }
}
