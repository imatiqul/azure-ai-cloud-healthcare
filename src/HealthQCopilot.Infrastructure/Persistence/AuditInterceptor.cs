using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace HealthQCopilot.Infrastructure.Persistence;

/// <summary>
/// Automatically sets ModifiedAt on entities that have the property when state is Modified.
/// Convention-based: works with any entity that has a DateTime? ModifiedAt property.
/// </summary>
public sealed class AuditInterceptor : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not null)
            ApplyAuditTimestamps(eventData.Context);

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        if (eventData.Context is not null)
            ApplyAuditTimestamps(eventData.Context);

        return base.SavingChanges(eventData, result);
    }

    private static void ApplyAuditTimestamps(DbContext context)
    {
        var now = DateTime.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Modified)
            {
                var modifiedAt = entry.Properties
                    .FirstOrDefault(p => p.Metadata.Name == "ModifiedAt");
                if (modifiedAt is not null)
                    modifiedAt.CurrentValue = now;
            }

            if (entry.State == EntityState.Added)
            {
                var createdAt = entry.Properties
                    .FirstOrDefault(p => p.Metadata.Name == "CreatedAt");
                if (createdAt is not null && createdAt.CurrentValue is DateTime dt && dt == default)
                    createdAt.CurrentValue = now;
            }
        }
    }
}
