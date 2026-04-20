using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.Persistence;

public class IdentityDbContext(DbContextOptions<IdentityDbContext> options)
    : OutboxDbContext(options)
{
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<OtpRecord> OtpRecords => Set<OtpRecord>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<BreakGlassAccess> BreakGlassAccesses => Set<BreakGlassAccess>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.ToTable("user_accounts");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ExternalId).HasMaxLength(256).IsRequired();
            entity.Property(e => e.Email).HasMaxLength(256).IsRequired();
            entity.Property(e => e.DisplayName).HasMaxLength(256).IsRequired();
            entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.FhirPatientId).HasMaxLength(128);
            entity.HasIndex(e => e.ExternalId).IsUnique();
            entity.HasIndex(e => e.Email).IsUnique();
        });

        modelBuilder.Entity<OtpRecord>(entity =>
        {
            entity.ToTable("otp_records");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PhoneNumber).HasMaxLength(32).IsRequired();
            entity.Property(e => e.CodeHash).HasMaxLength(64).IsRequired();
            entity.Property(e => e.ExpiresAt).HasColumnType("timestamp with time zone");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp with time zone");
            entity.HasIndex(e => new { e.PhoneNumber, e.IsUsed });
            entity.HasIndex(e => e.ExpiresAt);
        });

        modelBuilder.Entity<ConsentRecord>(entity =>
        {
            entity.ToTable("consent_records");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PatientUserId).IsRequired();
            entity.Property(e => e.Purpose).HasMaxLength(128).IsRequired();
            entity.Property(e => e.Scope).HasMaxLength(256).IsRequired();
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.PolicyVersion).HasMaxLength(32).IsRequired();
            entity.Property(e => e.JurisdictionCode).HasMaxLength(8);
            entity.Property(e => e.GrantedByIp).HasMaxLength(64);
            entity.Property(e => e.RevocationReason).HasMaxLength(512);
            entity.Property(e => e.GrantedAt).HasColumnType("timestamp with time zone");
            entity.Property(e => e.ExpiresAt).HasColumnType("timestamp with time zone");
            entity.Property(e => e.RevokedAt).HasColumnType("timestamp with time zone");
            entity.HasIndex(e => e.PatientUserId);
            entity.HasIndex(e => new { e.PatientUserId, e.Purpose, e.Status });
        });

        modelBuilder.Entity<BreakGlassAccess>(entity =>
        {
            entity.ToTable("break_glass_accesses");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RequestedByUserId).IsRequired();
            entity.Property(e => e.TargetPatientId).HasMaxLength(128).IsRequired();
            entity.Property(e => e.ClinicalJustification).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.RevocationReason).HasMaxLength(512);
            entity.Property(e => e.GrantedAt).HasColumnType("timestamp with time zone");
            entity.Property(e => e.ExpiresAt).HasColumnType("timestamp with time zone");
            entity.Property(e => e.RevokedAt).HasColumnType("timestamp with time zone");
            entity.HasIndex(e => e.RequestedByUserId);
            entity.HasIndex(e => e.TargetPatientId);
            entity.HasIndex(e => new { e.Status, e.ExpiresAt }); // For expiry sweep
        });
    }
}
