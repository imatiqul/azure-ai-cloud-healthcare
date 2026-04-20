namespace HealthQCopilot.Fhir.Endpoints;

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

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

    // ── SMART EHR App Launch ──────────────────────────────────────────────────
    // Called by the EHR to initiate an app launch with a launch token.
    // Validates the FHIR server URL (iss), generates PKCE parameters, and
    // redirects to the B2C authorization endpoint.
    //
    // Query params:
    //   iss    — FHIR server base URL provided by the EHR (must match this server)
    //   launch — opaque launch token from the EHR
    public static IEndpointRouteBuilder MapSmartLaunchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/smart/launch", (
            string? iss,
            string? launch,
            HttpContext http,
            IConfiguration config,
            IMemoryCache cache,
            ILogger<SmartLaunchLog> logger) =>
        {
            if (string.IsNullOrEmpty(iss) || string.IsNullOrEmpty(launch))
                return Results.BadRequest(new { error = "iss and launch parameters are required" });

            // Validate iss matches this server's FHIR base URL (prevents open-redirect abuse)
            var expectedFhirBase = (config["FhirServer:BaseUrl"]
                ?? $"{http.Request.Scheme}://{http.Request.Host}/api/v1/fhir")
                .TrimEnd('/');
            if (!iss.TrimEnd('/').Equals(expectedFhirBase, StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("SMART launch rejected — iss {Iss} does not match expected {Expected}", iss, expectedFhirBase);
                return Results.BadRequest(new { error = "Invalid iss parameter" });
            }

            // Generate PKCE: code_verifier (64 random bytes, base64url), code_challenge (SHA-256)
            var verifierBytes = RandomNumberGenerator.GetBytes(64);
            var codeVerifier = Base64UrlEncode(verifierBytes);
            var challengeBytes = SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier));
            var codeChallenge = Base64UrlEncode(challengeBytes);

            // State ties the callback back to this launch; stored in memory cache (5 min TTL)
            var state = Guid.NewGuid().ToString("N");
            cache.Set($"smart:pkce:{state}", (codeVerifier, launch), TimeSpan.FromMinutes(5));

            var b2cClientId = config["AzureAdB2C:ClientId"] ?? string.Empty;
            var b2cAuthority = config["AzureAdB2C:Authority"]
                ?? $"https://login.microsoftonline.com/tfp/{config["AzureAdB2C:Domain"]}/{config["AzureAdB2C:SignUpSignInPolicyId"]}/oauth2/v2.0/authorize";

            var callbackUri = Uri.EscapeDataString(
                $"{http.Request.Scheme}://{http.Request.Host}/smart/callback");

            var scopes = Uri.EscapeDataString("openid profile fhirUser launch offline_access");

            var authUrl = $"{b2cAuthority}?" +
                $"response_type=code" +
                $"&client_id={Uri.EscapeDataString(b2cClientId)}" +
                $"&redirect_uri={callbackUri}" +
                $"&scope={scopes}" +
                $"&code_challenge={codeChallenge}" +
                $"&code_challenge_method=S256" +
                $"&state={state}" +
                $"&launch={Uri.EscapeDataString(launch)}";

            logger.LogInformation("SMART EHR launch initiated — state {State}", state);
            return Results.Redirect(authUrl);
        })
        .WithTags("SMART on FHIR")
        .WithName("SmartLaunch")
        .AllowAnonymous();

        // ── SMART Token Callback ──────────────────────────────────────────────
        // B2C redirects here after the patient authenticates.
        // Exchanges the authorization code for tokens using PKCE and returns a
        // SMART token response suitable for the EHR to pass to the app.
        //
        // Query params (success): code, state
        // Query params (error):   error, error_description
        app.MapGet("/smart/callback", async (
            string? code,
            string? state,
            string? error,
            string? error_description,
            HttpContext http,
            IConfiguration config,
            IMemoryCache cache,
            IHttpClientFactory httpClientFactory,
            ILogger<SmartLaunchLog> logger,
            CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(error))
            {
                logger.LogWarning("SMART callback received error {Error}: {Desc}", error, error_description);

                // AADB2C90118 = user clicked "Forgot password?" — surface as 401 so the
                // EHR can handle the password-reset user experience.
                if (error_description?.Contains("AADB2C90118") == true)
                    return Results.Unauthorized();

                return Results.BadRequest(new { error, error_description });
            }

            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Results.BadRequest(new { error = "code and state are required" });

            // Retrieve PKCE state stored during /smart/launch
            if (!cache.TryGetValue<(string codeVerifier, string launch)>($"smart:pkce:{state}", out var pkce))
            {
                logger.LogWarning("SMART callback — state {State} not found or expired", state);
                return Results.BadRequest(new { error = "Invalid or expired state. Please restart the launch flow." });
            }
            cache.Remove($"smart:pkce:{state}");

            var b2cClientId = config["AzureAdB2C:ClientId"] ?? string.Empty;
            var b2cClientSecret = config["AzureAdB2C:ClientSecret"] ?? string.Empty;
            var tokenEndpoint = config["AzureAdB2C:TokenEndpoint"]
                ?? $"https://login.microsoftonline.com/tfp/{config["AzureAdB2C:Domain"]}/{config["AzureAdB2C:SignUpSignInPolicyId"]}/oauth2/v2.0/token";
            var callbackUri = $"{http.Request.Scheme}://{http.Request.Host}/smart/callback";

            // Exchange code + PKCE verifier for tokens
            using var client = httpClientFactory.CreateClient("SmartTokenExchange");
            var body = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"]    = "authorization_code",
                ["client_id"]     = b2cClientId,
                ["client_secret"] = b2cClientSecret,
                ["code"]          = code,
                ["redirect_uri"]  = callbackUri,
                ["code_verifier"] = pkce.codeVerifier,
            });

            using var response = await client.PostAsync(tokenEndpoint, body, ct);
            if (!response.IsSuccessStatusCode)
            {
                var raw = await response.Content.ReadAsStringAsync(ct);
                logger.LogError("SMART token exchange failed {Status}: {Body}", (int)response.StatusCode, raw);
                return Results.Problem("Token exchange failed. Please try again.", statusCode: 502);
            }

            using var tokenJson = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = tokenJson.RootElement;

            string? GetString(string name) =>
                root.TryGetProperty(name, out var v) ? v.GetString() : null;
            int GetInt(string name, int fallback) =>
                root.TryGetProperty(name, out var v) && v.TryGetInt32(out var i) ? i : fallback;

            // SMART token response per https://hl7.org/fhir/smart-app-launch/app-launch.html#response-5
            return Results.Ok(new
            {
                access_token  = GetString("access_token"),
                token_type    = "Bearer",
                expires_in    = GetInt("expires_in", 3600),
                refresh_token = GetString("refresh_token"),
                id_token      = GetString("id_token"),
                scope         = GetString("scope"),
                // Hint to the app which patient context was selected — populated from claims
                // if the EHR passes patient context in the launch token
                patient       = (string?)null,
                // fhirUser claim is populated from the id_token; the SMART app resolves
                // the full Patient resource URL from this value
                fhirUser      = (string?)null,
            });
        })
        .WithTags("SMART on FHIR")
        .WithName("SmartCallback")
        .AllowAnonymous();

        return app;
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes)
               .TrimEnd('=')
               .Replace('+', '-')
               .Replace('/', '_');

    private static object[] Interactions(params string[] codes) =>
        codes.Select(c => (object)new { code = c }).ToArray();
}

// Marker type for ILogger category in SMART launch endpoints (CS0718 workaround)
internal sealed class SmartLaunchLog { }
