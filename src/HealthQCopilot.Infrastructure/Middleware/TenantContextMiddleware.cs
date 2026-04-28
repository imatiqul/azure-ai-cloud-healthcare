using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Middleware;

/// <summary>
/// Enriches every log entry with <c>TenantId</c>, <c>UserId</c>, and <c>PatientId</c>
/// extracted from the incoming request. This enables compliance-grade log correlation:
/// queries like "show all PHI access for tenant X / patient Y" work reliably in
/// Azure Monitor, Sentinel, and Elastic.
///
/// Tenant context is pushed via <see cref="ILogger.BeginScope"/> so it appears on
/// every structured log record emitted within the async execution context of the
/// request — including logs from injected services — when the OpenTelemetry logger
/// provider is configured with <c>IncludeScopes = true</c>.
///
/// Must be registered BEFORE authentication middleware so that even auth failures
/// are logged with tenant context.
/// </summary>
public sealed class TenantContextMiddleware(RequestDelegate next, ILogger<TenantContextMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        // ── Tenant ID ─────────────────────────────────────────────────────────
        // Prefer explicit header (API Gateway sets this after APIM policy evaluation)
        // Fall back to the "tid" (tenant ID) claim in the JWT bearer token
        var tenantId = context.Request.Headers["X-Tenant-Id"].FirstOrDefault()
            ?? context.User?.FindFirst("tid")?.Value
            ?? context.User?.FindFirst("http://schemas.microsoft.com/identity/claims/tenantid")?.Value
            ?? "unknown";

        // ── User ID ───────────────────────────────────────────────────────────
        var userId = context.User?.FindFirst("sub")?.Value
            ?? context.User?.FindFirst("oid")?.Value
            ?? context.Request.Headers["X-User-Id"].FirstOrDefault()
            ?? "anonymous";

        // ── Patient ID ────────────────────────────────────────────────────────
        // Extracted from route values (e.g. /patients/{patientId}) or explicit header
        var patientId = context.Request.RouteValues["patientId"]?.ToString()
            ?? context.Request.Headers["X-Patient-Id"].FirstOrDefault()
            ?? "-";

        // BeginScope pushes a structured dictionary onto the ambient IExternalScopeProvider
        // shared by all ILoggerProvider implementations (including the OTel provider).
        // All log entries emitted within the async execution context of this request
        // will carry these three key-value pairs as OTel log record attributes.
        using var scope = logger.BeginScope(new Dictionary<string, object?>
        {
            ["TenantId"] = tenantId,
            ["UserId"] = userId,
            ["PatientId"] = patientId,
        });

        await next(context);
    }
}
