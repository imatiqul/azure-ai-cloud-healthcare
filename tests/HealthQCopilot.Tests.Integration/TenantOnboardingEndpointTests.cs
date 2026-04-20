using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Integration tests for Tenant Onboarding endpoints (Phase 29).
/// Covers: provision, get-by-id, list, delete (GDPR right-to-erasure).
/// The test auth handler grants PlatformAdmin via the "PlatformAdmin" policy in the factory.
/// </summary>
public class TenantOnboardingEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public TenantOnboardingEndpointTests(PostgresFixture postgres)
    {
        var factory = new ServiceWebApplicationFactory<IdentityDbContext, IdentityDbContext>(postgres);
        _client = factory.CreateClient();
    }

    // ── POST /api/v1/tenants ───────────────────────────────────────────────────

    [Fact]
    public async Task ProvisionTenant_ValidRequest_ReturnsCreated()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "Riverside Health System",
            Slug = $"riverside-{Guid.NewGuid():N}",
            Locale = "en-US",
            DataRegion = "eastus",
            AdminEmail = "admin@riverside.health",
            AdminDisplayName = "Riverside Admin"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("organisationName").GetString().Should().Be("Riverside Health System");
        doc.RootElement.GetProperty("slug").GetString().Should().StartWith("riverside-");
    }

    [Fact]
    public async Task ProvisionTenant_DuplicateSlug_ReturnsConflict()
    {
        var slug = $"dupe-slug-{Guid.NewGuid():N}";
        await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "First Org",
            Slug = slug,
            Locale = "en-US",
            DataRegion = "eastus",
            AdminEmail = "admin@first.org",
            AdminDisplayName = "First Admin"
        });

        var second = await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "Second Org",
            Slug = slug,
            Locale = "en-GB",
            DataRegion = "uksouth",
            AdminEmail = "admin@second.org",
            AdminDisplayName = "Second Admin"
        });

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── GET /api/v1/tenants/{id} ───────────────────────────────────────────────

    [Fact]
    public async Task GetTenantById_AfterProvision_ReturnsTenant()
    {
        var slug = $"getid-{Guid.NewGuid():N}";
        var created = await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "GetById Health",
            Slug = slug,
            Locale = "en-US",
            DataRegion = "westus",
            AdminEmail = "admin@getbyid.health",
            AdminDisplayName = "GetById Admin"
        });
        var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("tenantId").GetGuid();

        var response = await _client.GetAsync($"/api/v1/tenants/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("organisationName").GetString().Should().Be("GetById Health");
    }

    [Fact]
    public async Task GetTenantById_NonExistentId_ReturnsNotFound()
    {
        var response = await _client.GetAsync($"/api/v1/tenants/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── GET /api/v1/tenants ────────────────────────────────────────────────────

    [Fact]
    public async Task ListTenants_AfterProvision_ReturnsListWithTenant()
    {
        var slug = $"list-{Guid.NewGuid():N}";
        await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "List Org",
            Slug = slug,
            Locale = "en-AU",
            DataRegion = "australiaeast",
            AdminEmail = "admin@list.org",
            AdminDisplayName = "List Admin"
        });

        var response = await _client.GetAsync("/api/v1/tenants?page=1&pageSize=100");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("total").GetInt32().Should().BeGreaterThan(0);
        body.RootElement.GetProperty("items").GetArrayLength().Should().BeGreaterThan(0);
    }

    // ── DELETE /api/v1/tenants/{id} — GDPR right-to-erasure ───────────────────

    [Fact]
    public async Task DeleteTenant_AfterProvision_ReturnsNoContent()
    {
        var slug = $"delete-{Guid.NewGuid():N}";
        var created = await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "Delete Me Org",
            Slug = slug,
            Locale = "en-US",
            DataRegion = "eastus",
            AdminEmail = "admin@deleteme.org",
            AdminDisplayName = "Delete Admin"
        });
        var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("tenantId").GetGuid();

        var response = await _client.DeleteAsync($"/api/v1/tenants/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeleteTenant_AfterDelete_GetReturnNotFound()
    {
        var slug = $"del-verify-{Guid.NewGuid():N}";
        var created = await _client.PostAsJsonAsync("/api/v1/tenants", new
        {
            OrganisationName = "Verify Delete Org",
            Slug = slug,
            Locale = "en-US",
            DataRegion = "eastus",
            AdminEmail = "admin@verify.org",
            AdminDisplayName = "Verify Admin"
        });
        var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("tenantId").GetGuid();

        await _client.DeleteAsync($"/api/v1/tenants/{id}");

        var getAfterDelete = await _client.GetAsync($"/api/v1/tenants/{id}");
        getAfterDelete.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteTenant_NonExistentId_ReturnsNotFound()
    {
        var response = await _client.DeleteAsync($"/api/v1/tenants/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
