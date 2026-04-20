using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.RevenueCycle.Infrastructure;

public class RevenueDbContext : OutboxDbContext
{
    public DbSet<CodingJob> CodingJobs => Set<CodingJob>();
    public DbSet<PriorAuth> PriorAuths => Set<PriorAuth>();
    public DbSet<ClaimSubmission> ClaimSubmissions => Set<ClaimSubmission>();
    public DbSet<RemittanceAdvice> RemittanceAdvices => Set<RemittanceAdvice>();

    public RevenueDbContext(DbContextOptions<RevenueDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<CodingJob>(b =>
        {
            b.ToTable("coding_jobs");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.EncounterId).HasMaxLength(128).IsRequired();
            b.Property(e => e.PatientId).HasMaxLength(128).IsRequired();
            b.Property(e => e.PatientName).HasMaxLength(256).IsRequired();
            b.Property(e => e.ReviewedBy).HasMaxLength(128);
            b.Property(e => e.SuggestedCodes).HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList());
            b.Property(e => e.ApprovedCodes).HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList());
            b.HasIndex(e => e.PatientId);
            b.HasIndex(e => e.Status);
        });

        modelBuilder.Entity<PriorAuth>(b =>
        {
            b.ToTable("prior_auths");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.PatientId).HasMaxLength(128).IsRequired();
            b.Property(e => e.PatientName).HasMaxLength(256).IsRequired();
            b.Property(e => e.Procedure).HasMaxLength(512).IsRequired();
            b.Property(e => e.ProcedureCode).HasMaxLength(32);
            b.Property(e => e.InsurancePayer).HasMaxLength(256);
            b.Property(e => e.DenialReason).HasMaxLength(1024);
            b.HasIndex(e => e.PatientId);
            b.HasIndex(e => e.Status);
        });

        // ── EDI 837 Claim Submissions ─────────────────────────────────────────
        modelBuilder.Entity<ClaimSubmission>(b =>
        {
            b.ToTable("claim_submissions");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(e => e.ClaimType).HasConversion<string>().HasMaxLength(16);
            b.Property(e => e.PatientId).HasMaxLength(128).IsRequired();
            b.Property(e => e.PatientName).HasMaxLength(256).IsRequired();
            b.Property(e => e.EncounterId).HasMaxLength(128).IsRequired();
            b.Property(e => e.InsurancePayer).HasMaxLength(256).IsRequired();
            b.Property(e => e.InterchangeControlNumber).HasMaxLength(9).IsRequired();
            b.Property(e => e.ClearinghouseClaimId).HasMaxLength(64);
            b.Property(e => e.RejectionReason).HasMaxLength(1024);
            b.Property(e => e.DiagnosisCodes).HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList());
            b.Property(e => e.CreatedAt).HasColumnType("timestamp with time zone");
            b.Property(e => e.SubmittedAt).HasColumnType("timestamp with time zone");
            b.Property(e => e.AcknowledgedAt).HasColumnType("timestamp with time zone");
            b.HasIndex(e => e.CodingJobId);
            b.HasIndex(e => e.PatientId);
            b.HasIndex(e => e.Status);
        });

        // ── EDI 835 Remittance Advices ────────────────────────────────────────
        modelBuilder.Entity<RemittanceAdvice>(b =>
        {
            b.ToTable("remittance_advices");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(e => e.PaymentMethod).HasConversion<string>().HasMaxLength(16);
            b.Property(e => e.PaymentReferenceNumber).HasMaxLength(64).IsRequired();
            b.Property(e => e.PayerName).HasMaxLength(256).IsRequired();
            b.Property(e => e.PaymentDate).HasColumnType("timestamp with time zone");
            b.Property(e => e.CreatedAt).HasColumnType("timestamp with time zone");
            b.Property(e => e.PostedAt).HasColumnType("timestamp with time zone");
            b.HasIndex(e => e.PaymentReferenceNumber);
            b.HasIndex(e => e.Status);
            // ClaimLines stored as owned JSON (EF Core 8+ column)
            b.OwnsMany(e => e.ClaimLines, cl =>
            {
                cl.ToTable("remittance_claim_lines");
                cl.HasKey(x => x.Id);
                cl.Property(x => x.ClearinghouseClaimId).HasMaxLength(64);
                cl.Property(x => x.PatientId).HasMaxLength(128);
                cl.Property(x => x.ClpStatusCode).HasMaxLength(4);
                cl.Property(x => x.DenialReasonCode).HasMaxLength(8);
                cl.OwnsMany(x => x.ServiceLines, sl =>
                {
                    sl.ToTable("remittance_service_lines");
                    sl.HasKey("Id");
                    sl.Property<Guid>("Id").ValueGeneratedOnAdd();
                    sl.Property(x => x.ProcedureCode).HasMaxLength(32);
                    sl.Property(x => x.ReasonCode).HasMaxLength(8);
                });
            });
        });
    }
}
