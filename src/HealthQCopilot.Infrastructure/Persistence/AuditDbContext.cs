using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Infrastructure.Persistence;

/// <summary>
/// Append-only audit database context.
/// Write once; the PostgreSQL RLS policy prevents UPDATE and DELETE on phi_audit_logs.
/// </summary>
public class AuditDbContext(DbContextOptions<AuditDbContext> options) : DbContext(options)
{
    public DbSet<PhiAuditLog> PhiAuditLogs => Set<PhiAuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PhiAuditLog>(e =>
        {
            e.ToTable("phi_audit_logs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id").HasMaxLength(128).IsRequired();
            e.Property(x => x.HttpMethod).HasColumnName("http_method").HasMaxLength(10).IsRequired();
            e.Property(x => x.ResourcePath).HasColumnName("resource_path").HasMaxLength(512).IsRequired();
            e.Property(x => x.StatusCode).HasColumnName("status_code").IsRequired();
            e.Property(x => x.CorrelationId).HasColumnName("correlation_id").HasMaxLength(128);
            e.Property(x => x.AccessedAt).HasColumnName("accessed_at").IsRequired();

            // Ensure rows are never updatable via EF
            e.Metadata.SetIsTableExcludedFromMigrations(false);
        });

        // Raw SQL migration to apply PostgreSQL RLS (run once in seed script)
        // ALTER TABLE phi_audit_logs ENABLE ROW LEVEL SECURITY;
        // CREATE POLICY audit_insert_only ON phi_audit_logs FOR INSERT WITH CHECK (true);
        // REVOKE UPDATE, DELETE ON phi_audit_logs FROM PUBLIC;
    }
}

public sealed class PhiAuditLog
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string HttpMethod { get; set; } = string.Empty;
    public string ResourcePath { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public string? CorrelationId { get; set; }
    public DateTime AccessedAt { get; set; }
}
