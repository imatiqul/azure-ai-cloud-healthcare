namespace HealthQCopilot.Fhir.Endpoints;

/// <summary>
/// SMART on FHIR 2.0 interoperability endpoints.
/// Provides OIDC discovery and SMART capability statement so EHR systems
/// can perform App Launch, standalone launch, and PKCE-based token exchange.
/// Reference: https://hl7.org/fhir/smart-app-launch/conformance.html
/// </summary>
public static class SmartEndpoints
{
    public static IEndpointRouteBuilder MapSmartEndpoints(this IEndpointRouteBuilder app)
    {
        // ── SMART on FHIR App Launch configuration ────────────────────────────
        // EHRs and SMART clients discover capabilities from this document.
        app.MapGet("/.well-known/smart-configuration", (IConfiguration config, HttpContext http) =>
        {
            var issuer = config["AzureAd:Authority"]
                ?? $"{http.Request.Scheme}://{http.Request.Host}";

            var fhirBase = config["FhirServer:BaseUrl"]
                ?? $"{http.Request.Scheme}://{http.Request.Host}/api/v1/fhir";

            return Results.Json(new
            {
                issuer,
                jwks_uri = $"{issuer}/discovery/v2.0/keys",
                authorization_endpoint = $"{issuer}/oauth2/v2.0/authorize",
                token_endpoint = $"{issuer}/oauth2/v2.0/token",
                token_endpoint_auth_methods_supported = new[] { "private_key_jwt", "client_secret_basic" },
                grant_types_supported = new[] { "authorization_code", "client_credentials", "refresh_token" },
                registration_endpoint = $"{issuer}/connect/register",
                scopes_supported = new[]
                {
                    "openid", "profile", "fhirUser",
                    "launch", "launch/patient", "launch/encounter",
                    "patient/*.read", "patient/*.write",
                    "user/*.read", "user/*.write",
                    "system/*.read", "system/*.write",
                    "offline_access"
                },
                response_types_supported = new[] { "code" },
                management_endpoint = $"{fhirBase}/Patient",
                introspection_endpoint = $"{issuer}/oauth2/v2.0/introspect",
                revocation_endpoint = $"{issuer}/oauth2/v2.0/revoke",
                // SMART capabilities declared by this server
                capabilities = new[]
                {
                    "launch-ehr",
                    "launch-standalone",
                    "client-public",
                    "client-confidential-symmetric",
                    "client-confidential-asymmetric",
                    "context-passthrough-banner",
                    "context-style",
                    "context-ehr-patient",
                    "context-ehr-encounter",
                    "context-standalone-patient",
                    "permission-offline",
                    "permission-patient",
                    "permission-user",
                    "sso-openid-connect",
                    "authorize-post"
                },
                code_challenge_methods_supported = new[] { "S256" }
            }, options: new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower,
                WriteIndented = true
            });
        })
        .WithTags("SMART on FHIR")
        .WithName("SmartConfiguration")
        .AllowAnonymous();

        // ── OpenID Connect discovery document ─────────────────────────────────
        // Standard OIDC discovery so SMART clients can resolve signing keys.
        app.MapGet("/.well-known/openid-configuration", (IConfiguration config, HttpContext http) =>
        {
            var issuer = config["AzureAd:Authority"]
                ?? $"{http.Request.Scheme}://{http.Request.Host}";

            return Results.Json(new
            {
                issuer,
                authorization_endpoint = $"{issuer}/oauth2/v2.0/authorize",
                token_endpoint = $"{issuer}/oauth2/v2.0/token",
                jwks_uri = $"{issuer}/discovery/v2.0/keys",
                userinfo_endpoint = $"{issuer}/oidc/userinfo",
                subject_types_supported = new[] { "pairwise" },
                id_token_signing_alg_values_supported = new[] { "RS256" },
                scopes_supported = new[] { "openid", "profile", "email", "fhirUser", "offline_access" },
                claims_supported = new[] { "sub", "iss", "email", "name", "fhirUser" },
                response_types_supported = new[] { "code" },
                grant_types_supported = new[] { "authorization_code", "client_credentials" },
                token_endpoint_auth_methods_supported = new[] { "private_key_jwt", "client_secret_basic" },
                code_challenge_methods_supported = new[] { "S256" }
            }, options: new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower,
                WriteIndented = true
            });
        })
        .WithTags("SMART on FHIR")
        .WithName("OidcDiscovery")
        .AllowAnonymous();

        // ── FHIR CapabilityStatement with SMART extensions ────────────────────
        // Returns R4 CapabilityStatement advertising SMART on FHIR support.
        app.MapGet("/api/v1/fhir/metadata", (IConfiguration config, HttpContext http) =>
        {
            var serverBase = $"{http.Request.Scheme}://{http.Request.Host}/api/v1/fhir";
            var smartUri = $"{http.Request.Scheme}://{http.Request.Host}/.well-known/smart-configuration";

            return Results.Json(new
            {
                resourceType = "CapabilityStatement",
                status = "active",
                date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                kind = "instance",
                fhirVersion = "4.0.1",
                format = new[] { "json", "xml" },
                rest = new[]
                {
                    new
                    {
                        mode = "server",
                        security = new
                        {
                            extension = new[]
                            {
                                new
                                {
                                    url = "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                    extension = new[]
                                    {
                                        new { url = "smart-configuration", valueUri = smartUri }
                                    }
                                }
                            },
                            service = new[] { new { coding = new[] { new { code = "SMART-on-FHIR" } } } },
                            description = "SMART on FHIR 2.0 OAuth2 / PKCE authorization"
                        },
                        resource = new[]
                        {
                            new { type = "Patient",        interaction = Interactions("read", "search-type", "create", "update") },
                            new { type = "Encounter",      interaction = Interactions("read", "search-type", "create", "update") },
                            new { type = "Appointment",    interaction = Interactions("read", "search-type", "create") },
                            new { type = "Observation",    interaction = Interactions("read", "search-type") },
                            new { type = "Condition",      interaction = Interactions("read", "search-type") },
                            new { type = "MedicationRequest", interaction = Interactions("read", "search-type") }
                        }
                    }
                }
            });
        })
        .WithTags("SMART on FHIR")
        .WithName("FhirMetadata")
        .AllowAnonymous();

        return app;
    }

    private static object[] Interactions(params string[] codes) =>
        codes.Select(c => (object)new { code = c }).ToArray();
}
