using System.Net.Http.Json;
using System.Text.Json;

namespace HealthQCopilot.Fhir.Middleware;

/// <summary>
/// HIPAA/GDPR consent enforcement middleware for FHIR data access.
///
/// Before allowing a FHIR data access request, verifies that a valid
/// active consent record exists for the requesting patient and the relevant
/// data-access purpose.
///
/// Exempt paths (bypass consent check):
///   - /health, /livez, /readyz  (health probes)
///   - /openapi, /swagger         (API docs)
///   - /api/v1/smart              (SMART on FHIR auth flows)
///   - /api/v1/cds-services       (CDS Hooks — passive)
///   - POST /api/v1/fhir/consent  (consent grant itself)
///
/// Consent is checked against the Identity service via HTTP.
/// On HTTP failure, the middleware fails OPEN (allows access) to avoid
/// blocking emergency care when the Identity service is unavailable.
/// </summary>
public sealed class ConsentEnforcementMiddleware(
    RequestDelegate next,
    IHttpClientFactory httpClientFactory,
    ILogger<ConsentEnforcementMiddleware> logger)
{
    private static readonly HashSet<string> ExemptPrefixes = new(StringComparer.OrdinalIgnoreCase)
    {
        "/health", "/livez", "/readyz",
        "/openapi", "/swagger",
        "/api/v1/smart",
        "/api/v1/cds-services",
    };

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        if (ShouldBypass(path))
        {
            await next(context);
            return;
        }

        // Only enforce on FHIR data endpoints
        if (!path.StartsWith("/api/v1/fhir", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // Determine patient from JWT claim
        var patientUserIdClaim = context.User?.FindFirst("sub")?.Value
            ?? context.User?.FindFirst("oid")?.Value;

        if (patientUserIdClaim is null)
        {
            // Anonymous — let auth middleware handle 401
            await next(context);
            return;
        }

        var purpose = DeterminePurpose(context);
        var hasConsent = await CheckConsentAsync(patientUserIdClaim, purpose, context.RequestAborted);

        if (!hasConsent)
        {
            logger.LogWarning(
                "Consent denied: PatientId={PatientId} Purpose={Purpose} Path={Path}",
                patientUserIdClaim, purpose, path);

            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                """{"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"forbidden","diagnostics":"Active patient consent required for this data access request."}]}""",
                context.RequestAborted);
            return;
        }

        await next(context);
    }

    // ── Consent check ─────────────────────────────────────────────────────────

    private async Task<bool> CheckConsentAsync(string patientUserId, string purpose, CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("IdentityService");
            var resp = await client.GetAsync(
                $"/api/v1/identity/consent?patientId={Uri.EscapeDataString(patientUserId)}&purpose={Uri.EscapeDataString(purpose)}&status=Active",
                ct);

            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("ConsentCheck: Identity service returned {Status} — failing open", resp.StatusCode);
                return true; // Fail open to avoid blocking care
            }

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            // Returns an array — any active consent matching this purpose = allowed
            return doc.RootElement.GetArrayLength() > 0;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ConsentCheck: connectivity error — failing open for patient {PatientId}", patientUserId);
            return true; // Fail open on network error
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool ShouldBypass(string path) =>
        ExemptPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));

    private static string DeterminePurpose(HttpContext context)
    {
        // Derive purpose from query param, header, or default to "treatment"
        if (context.Request.Query.TryGetValue("_purpose", out var qp) && !string.IsNullOrEmpty(qp))
            return qp.ToString();
        if (context.Request.Headers.TryGetValue("X-Consent-Purpose", out var hp) && !string.IsNullOrEmpty(hp))
            return hp.ToString();
        return "treatment";
    }
}
