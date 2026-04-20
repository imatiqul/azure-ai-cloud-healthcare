using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.BackgroundServices;

/// <summary>
/// Background sweep that marks expired break-glass access records.
/// Runs every minute; marks Active records whose ExpiresAt has passed.
/// Keeps records immutable for the audit trail — never deletes them.
/// </summary>
public sealed class BreakGlassExpiryService(
    IServiceScopeFactory scopeFactory,
    ILogger<BreakGlassExpiryService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("BreakGlassExpiryService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ExpireSessionsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "BreakGlassExpiryService: error during expiry sweep");
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task ExpireSessionsAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();

        var expired = await db.BreakGlassAccesses
            .Where(a => a.Status == BreakGlassStatus.Active && a.ExpiresAt <= DateTime.UtcNow)
            .ToListAsync(ct);

        if (expired.Count == 0) return;

        foreach (var access in expired)
            access.MarkExpired();

        await db.SaveChangesAsync(ct);
        logger.LogInformation("BreakGlassExpiryService: expired {Count} sessions", expired.Count);
    }
}
