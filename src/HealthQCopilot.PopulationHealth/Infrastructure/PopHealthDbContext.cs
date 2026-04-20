using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.PopulationHealth.Infrastructure;

public class PopHealthDbContext : OutboxDbContext
{
    public DbSet<PatientRisk> PatientRisks => Set<PatientRisk>();
    public DbSet<CareGap> CareGaps => Set<CareGap>();
    public DbSet<PatientSdohAssessment> SdohAssessments => Set<PatientSdohAssessment>();
    public DbSet<CostPrediction> CostPredictions => Set<CostPrediction>();
    public DbSet<PatientRiskHistory> PatientRiskHistories => Set<PatientRiskHistory>();

    public PopHealthDbContext(DbContextOptions<PopHealthDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<PatientRisk>(b =>
        {
            b.ToTable("patient_risks");
            b.HasKey(e => e.Id);
            b.Property(e => e.Level).HasConversion<string>();
            b.HasIndex(e => e.PatientId);
        });

        modelBuilder.Entity<CareGap>(b =>
        {
            b.ToTable("care_gaps");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.HasIndex(e => e.PatientId);
        });

        modelBuilder.Entity<PatientSdohAssessment>(b =>
        {
            b.ToTable("sdoh_assessments");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.PatientId);
            // JSON columns (stored as text; application-side deserialisation)
            b.Property(e => e.DomainScoresJson).HasColumnName("domain_scores_json");
            b.Property(e => e.PrioritizedNeedsJson).HasColumnName("prioritized_needs_json");
            b.Property(e => e.RecommendedActionsJson).HasColumnName("recommended_actions_json");
        });

        modelBuilder.Entity<CostPrediction>(b =>
        {
            b.ToTable("cost_predictions");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.PatientId);
            b.Property(e => e.Predicted12mCost).HasPrecision(12, 2);
            b.Property(e => e.LowerBound95).HasPrecision(12, 2);
            b.Property(e => e.UpperBound95).HasPrecision(12, 2);
            b.Property(e => e.CostDriversJson).HasColumnName("cost_drivers_json");
        });

        modelBuilder.Entity<PatientRiskHistory>(b =>
        {
            b.ToTable("patient_risk_history");
            b.HasKey(e => e.Id);
            b.Property(e => e.Level).HasConversion<string>();
            b.Property(e => e.Trend).HasConversion<string>();
            b.HasIndex(e => new { e.PatientId, e.AssessedAt });
        });
    }
}
