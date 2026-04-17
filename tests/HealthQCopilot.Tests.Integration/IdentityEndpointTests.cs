using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

public class IdentityEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public IdentityEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<IdentityDbContext, IdentityDbContext>(postgres);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateUser_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/identity/users", new
        {
            ExternalId = "ext-001",
            Email = "test@healthq.io",
            FullName = "Test User",
            UserRole = "Clinician"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("email").GetString().Should().Be("test@healthq.io");
    }

    [Fact]
    public async Task GetUser_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/api/v1/identity/users/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetUser_AfterCreate_ReturnsUser()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/identity/users", new
        {
            ExternalId = "ext-002",
            Email = "created@healthq.io",
            FullName = "Created User",
            UserRole = "Admin"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/api/v1/identity/users/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("email").GetString().Should().Be("created@healthq.io");
    }

    [Fact]
    public async Task LoginUser_AfterCreate_UpdatesLastLogin()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/identity/users", new
        {
            ExternalId = "ext-003",
            Email = "login@healthq.io",
            FullName = "Login User",
            UserRole = "Clinician"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsync($"/api/v1/identity/users/{id}/login", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DeactivateUser_AfterCreate_DeactivatesUser()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/v1/identity/users", new
        {
            ExternalId = "ext-004",
            Email = "deactivate@healthq.io",
            FullName = "Deactivate User",
            UserRole = "Clinician"
        });
        var doc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        var response = await _client.PostAsync($"/api/v1/identity/users/{id}/deactivate", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("isActive").GetBoolean().Should().BeFalse();
    }
}
