using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;

namespace HealthQCopilot.Identity.Endpoints;

/// <summary>
/// Audit report export endpoints (Phase 8 — Item 51).
///
/// Provides CSV and NDJSON exports of the PHI audit log.
/// - Restricted to PlatformAdmin role
/// - Supports date-range filtering (defaulting to last 30 days)
/// - Records are retained for 7 years (HIPAA § 164.530(j))
/// - Maximum export window: 90 days per request (use pagination for larger ranges)
/// </summary>
public static class AuditExportEndpoints
{
    private const int MaxExportDays = 90;

    public static IEndpointRouteBuilder MapAuditExportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/admin/audit")
            .WithTags("Audit Export")
            .RequireAuthorization("PlatformAdmin");

        // GET /api/v1/admin/audit/export?format=csv&from=2024-01-01&to=2024-01-31
        group.MapGet("/export", async (
            AuditDbContext db,
            string format = "csv",
            string? from = null,
            string? to = null,
            int page = 1,
            int pageSize = 5000,
            CancellationToken ct = default) =>
        {
            var toDate = to is not null ? DateTimeOffset.Parse(to, CultureInfo.InvariantCulture) : DateTimeOffset.UtcNow;
            var fromDate = from is not null ? DateTimeOffset.Parse(from, CultureInfo.InvariantCulture) : toDate.AddDays(-30);

            // Enforce max window
            if ((toDate - fromDate).TotalDays > MaxExportDays)
                return Results.BadRequest(new { error = $"Export window exceeds {MaxExportDays} days. Use pagination." });

            var query = db.PhiAuditLogs
                .Where(l => l.AccessedAt >= fromDate.UtcDateTime && l.AccessedAt <= toDate.UtcDateTime)
                .OrderByDescending(l => l.AccessedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);

            var rows = await query.ToListAsync(ct);

            return format.ToLowerInvariant() switch
            {
                "ndjson" => BuildNdJson(rows),
                _ => BuildCsv(rows)
            };
        });

        // GET /api/v1/admin/audit/summary?days=30 — aggregate counts per user/path
        group.MapGet("/summary", async (
            AuditDbContext db,
            int days = 30,
            CancellationToken ct = default) =>
        {
            var since = DateTime.UtcNow.AddDays(-days);

            var summary = await db.PhiAuditLogs
                .Where(l => l.AccessedAt >= since)
                .GroupBy(l => new { l.UserId, l.HttpMethod })
                .Select(g => new
                {
                    g.Key.UserId,
                    g.Key.HttpMethod,
                    Count = g.Count(),
                    LastAccessed = g.Max(l => l.AccessedAt)
                })
                .OrderByDescending(g => g.Count)
                .Take(100)
                .ToListAsync(ct);

            return Results.Ok(new { period = $"last {days} days", since, summary });
        });

        return app;
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private static IResult BuildCsv(List<PhiAuditLog> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Id,UserId,HttpMethod,ResourcePath,StatusCode,CorrelationId,AccessedAt");

        foreach (var r in rows)
        {
            sb.AppendLine(string.Join(",",
                r.Id,
                QuoteCsv(r.UserId),
                r.HttpMethod,
                QuoteCsv(r.ResourcePath),
                r.StatusCode,
                r.CorrelationId ?? string.Empty,
                r.AccessedAt.ToString("o")));
        }

        return Results.Content(sb.ToString(), "text/csv; charset=utf-8");
    }

    private static IResult BuildNdJson(List<PhiAuditLog> rows)
    {
        var sb = new StringBuilder();
        foreach (var r in rows)
            sb.AppendLine(System.Text.Json.JsonSerializer.Serialize(r));

        return Results.Content(sb.ToString(), "application/x-ndjson; charset=utf-8");
    }

    private static string QuoteCsv(string value) =>
        value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}
