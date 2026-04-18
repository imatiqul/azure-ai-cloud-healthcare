using System.Diagnostics;
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
/// </summary>
public class PhiAuditMiddleware
{
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

        var userId = context.User.FindFirst("oid")?.Value ?? "anonymous";
        var correlationId = Activity.Current?.Id ?? context.TraceIdentifier;
        var startedAt = DateTime.UtcNow;

        _logger.LogInformation(
            "PHI_ACCESS: User={UserId} Method={Method} Path={Path} CorrelationId={CorrelationId}",
            userId, context.Request.Method, path, correlationId);

        await _next(context);

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

