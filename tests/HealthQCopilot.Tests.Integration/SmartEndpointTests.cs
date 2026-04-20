using System.Net;
using System.Text.Json;
using HealthQCopilot.Fhir.Persistence;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// Integration tests for SMART on FHIR 2.0 discovery endpoints (Phase 29).
/// All SMART discovery endpoints are anonymous (no auth required).
/// </summary>
public class SmartEndpointTests : IClassFixture<PostgresFixture>
{
    private readonly HttpClient _client;

    public SmartEndpointTests(PostgresFixture postgres)
    {
        var factory = new SmartFhirWebApplicationFactory(postgres);
        _client = factory.CreateClient();
    }

    // ── GET /.well-known/smart-configuration ──────────────────────────────────

    [Fact]
    public async Task GetSmartConfiguration_ReturnsOk()
    {
        var response = await _client.GetAsync("/.well-known/smart-configuration");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetSmartConfiguration_ContainsScopesSupported()
    {
        var response = await _client.GetAsync("/.well-known/smart-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("scopes_supported");
        body.Should().Contain("openid");
        body.Should().Contain("fhirUser");
        body.Should().Contain("patient/*.read");
        body.Should().Contain("offline_access");
    }

    [Fact]
    public async Task GetSmartConfiguration_ContainsCapabilities()
    {
        var response = await _client.GetAsync("/.well-known/smart-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("capabilities");
        body.Should().Contain("launch-ehr");
        body.Should().Contain("launch-standalone");
        body.Should().Contain("sso-openid-connect");
    }

    [Fact]
    public async Task GetSmartConfiguration_ContainsPkceSupport()
    {
        var response = await _client.GetAsync("/.well-known/smart-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("code_challenge_methods_supported");
        body.Should().Contain("S256");
    }

    [Fact]
    public async Task GetSmartConfiguration_ContainsAuthorizationAndTokenEndpoints()
    {
        var response = await _client.GetAsync("/.well-known/smart-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("authorization_endpoint");
        body.Should().Contain("token_endpoint");
        body.Should().Contain("jwks_uri");
    }

    // ── GET /.well-known/openid-configuration ─────────────────────────────────

    [Fact]
    public async Task GetOidcConfiguration_ReturnsOk()
    {
        var response = await _client.GetAsync("/.well-known/openid-configuration");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetOidcConfiguration_ContainsIssuerAndEndpoints()
    {
        var response = await _client.GetAsync("/.well-known/openid-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("issuer");
        body.Should().Contain("authorization_endpoint");
        body.Should().Contain("token_endpoint");
        body.Should().Contain("jwks_uri");
        body.Should().Contain("userinfo_endpoint");
    }

    [Fact]
    public async Task GetOidcConfiguration_ContainsRS256AlgSupport()
    {
        var response = await _client.GetAsync("/.well-known/openid-configuration");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("id_token_signing_alg_values_supported");
        body.Should().Contain("RS256");
    }

    // ── GET /api/v1/fhir/metadata — FHIR CapabilityStatement ─────────────────

    [Fact]
    public async Task GetFhirMetadata_ReturnsCapabilityStatement()
    {
        var response = await _client.GetAsync("/api/v1/fhir/metadata");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("resourceType").GetString().Should().Be("CapabilityStatement");
        doc.RootElement.GetProperty("fhirVersion").GetString().Should().Be("4.0.1");
    }

    [Fact]
    public async Task GetFhirMetadata_AdvertisesSmartSupport()
    {
        var response = await _client.GetAsync("/api/v1/fhir/metadata");

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("smart-configuration");
        body.Should().Contain("SMART-on-FHIR");
    }
}

/// <summary>
/// Custom factory for SMART endpoint tests that stubs the external FHIR HTTP client.
/// </summary>
internal class SmartFhirWebApplicationFactory : ServiceWebApplicationFactory<FhirDbContext, FhirDbContext>
{
    public SmartFhirWebApplicationFactory(PostgresFixture postgres) : base(postgres) { }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureServices(services =>
        {
            services.AddHttpClient("FhirServer")
                .ConfigurePrimaryHttpMessageHandler(() => new FakeFhirHandler());
        });
    }
}
