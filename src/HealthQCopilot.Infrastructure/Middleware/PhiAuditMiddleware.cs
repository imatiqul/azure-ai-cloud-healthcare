using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Persistence;

namespace HealthQCopilot.Infrastructure.Middleware;

/// <summary>
/// HIPAA audit control: records every access to PHI endpoints in an append-only
/// audit log table. Log entries are immutable once written (no UPDATE/DELETE allowed
/// at the database level via row-level security policy).
/// <para>
/// Register it directly after <c>UseAuthentication()</c> and before
/// <c>UseAuthorization()</c>. After authentication, so that the record names the
/// caller the service authenticated. Before authorization, because authorization
/// answers a refused request itself: placed after it, this middleware would never
/// see a 401 or a 403 and refused attempts would leave no record.
/// </para>
/// </summary>
public class PhiAuditMiddleware
{
    /// <summary>Recorded in place of a user when the request carried no authenticated identity.</summary>
    public const string UnauthenticatedUser = "(unauthenticated)";

    /// <summary>Recorded in place of a user when the request was authenticated and its token carried no subject.</summary>
    public const string NoSubjectUser = "(no-subject)";

    private readonly RequestDelegate _next;
    private readonly ILogger<PhiAuditMiddleware> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    private static readonly HashSet<string> PhiPaths =
    [
        "/api/v1/patients",
        "/api/v1/encounters",
        "/api/v1/appointments",
        "/api/v1/fhir",
        "/api/v1/voice/sessions",
        "/api/v1/agents/triage",
        "/api/v1/scheduling/bookings",
        "/api/v1/population-health/risks",
        "/api/v1/revenue/coding-jobs",
        "/api/v1/revenue/prior-auths",
        "/api/v1/identity/users",
        "/api/v1/ocr/jobs"
    ];

    private readonly IEventHubAuditService? _eventHubAudit;

    public PhiAuditMiddleware(RequestDelegate next,
                              ILogger<PhiAuditMiddleware> logger,
                              IServiceScopeFactory scopeFactory,
                              IEventHubAuditService? eventHubAudit = null)
    {
        _next = next;
        _logger = logger;
        _scopeFactory = scopeFactory;
        _eventHubAudit = eventHubAudit;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var isPhiAccess = PhiPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

        if (!isPhiAccess)
        {
            await _next(context);
            return;
        }

        var correlationId = Activity.Current?.Id ?? context.TraceIdentifier;
        var startedAt = DateTime.UtcNow;

        _logger.LogInformation(
            "PHI_ACCESS: User={UserId} Method={Method} Path={Path} CorrelationId={CorrelationId}",
            ResolveUserId(context.User), context.Request.Method, path, correlationId);

        await _next(context);

        // The record names whoever the pipeline authenticated. It is read here, after the
        // pipeline has run, because authorization can authenticate with a scheme of its own.
        var userId = ResolveUserId(context.User);
        if (userId == NoSubjectUser)
        {
            _logger.LogWarning(
                "PHI_ACCESS_NO_SUBJECT: an authenticated request carried no subject claim. Path={Path} CorrelationId={CorrelationId}",
                path, correlationId);
        }

        var statusCode = context.Response.StatusCode;

        _logger.LogInformation(
            "PHI_ACCESS_COMPLETE: Path={Path} Status={StatusCode} DurationMs={DurationMs}",
            path, statusCode, (DateTime.UtcNow - startedAt).TotalMilliseconds);


        var durationMs = (long)(DateTime.UtcNow - startedAt).TotalMilliseconds;

        // Persist to append-only audit_log table (fire-and-forget; never block the response)
        _ = PersistAuditEntryAsync(userId, context.Request.Method, path,
            statusCode, correlationId, startedAt);

        // Dual-write to Azure Event Hubs for immutable, time-ordered HIPAA audit stream
        if (_eventHubAudit is not null)
            _ = _eventHubAudit.PublishAsync(
                AuditEvent.PhiAccess(path, context.Request.Method, userId,
                    null, statusCode, durationMs, correlationId));
    }

    /// <summary>
    /// The user an audit record names: the subject of the authenticated identity, read from
    /// the <c>sub</c> claim or from the name-identifier claim it is mapped to. Never a request
    /// header and never a value the caller can choose.
    /// </summary>
    internal static string ResolveUserId(ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true)
            return UnauthenticatedUser;

        var subject = user.FindFirst("sub")?.Value
            ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        return string.IsNullOrWhiteSpace(subject) ? NoSubjectUser : subject;
    }

    private async Task PersistAuditEntryAsync(string userId, string method, string path,
                                               int statusCode, string correlationId,
                                               DateTime accessedAt)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
            db.PhiAuditLogs.Add(new PhiAuditLog
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                HttpMethod = method,
                ResourcePath = path,
                StatusCode = statusCode,
                CorrelationId = correlationId,
                AccessedAt = accessedAt,
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist PHI audit log entry for {Path}", path);
        }
    }
}

