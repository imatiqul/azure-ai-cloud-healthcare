using System.Text.Json;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace HealthQCopilot.Agents.Infrastructure;

public class AgentDbContext : OutboxDbContext
{
    public DbSet<TriageWorkflow> TriageWorkflows => Set<TriageWorkflow>();
    public DbSet<AgentDecision> AgentDecisions => Set<AgentDecision>();
    public DbSet<GuideConversation> GuideConversations => Set<GuideConversation>();
    public DbSet<GuideMessage> GuideMessages => Set<GuideMessage>();
    public DbSet<DemoSession> DemoSessions => Set<DemoSession>();
    public DbSet<StepFeedback> StepFeedbacks => Set<StepFeedback>();
    public DbSet<OverallFeedback> OverallFeedbacks => Set<OverallFeedback>();
    public DbSet<DemoInsight> DemoInsights => Set<DemoInsight>();
    public DbSet<EscalationQueueItem> EscalationQueue => Set<EscalationQueueItem>();
    // AI Model Governance (Item 21)
    public DbSet<ModelRegistryEntry> ModelRegistryEntries => Set<ModelRegistryEntry>();
    public DbSet<PromptEvaluationRun> PromptEvaluationRuns => Set<PromptEvaluationRun>();
    // Phase 6 — Agentic AI Maturity
    public DbSet<ReasoningAuditEntry> ReasoningAuditEntries => Set<ReasoningAuditEntry>();
    public DbSet<PromptExperimentOutcome> PromptExperimentOutcomes => Set<PromptExperimentOutcome>();

    public AgentDbContext(DbContextOptions<AgentDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TriageWorkflow>(b =>
        {
            b.ToTable("triage_workflows");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.AssignedLevel).HasConversion<string>();
        });

        modelBuilder.Entity<AgentDecision>(b =>
        {
            b.ToTable("agent_decisions");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.WorkflowId);
        });

        modelBuilder.Entity<GuideConversation>(b =>
        {
            b.ToTable("guide_conversations");
            b.HasKey(e => e.Id);
            b.HasMany(e => e.Messages)
                .WithOne()
                .HasForeignKey(m => m.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuideMessage>(b =>
        {
            b.ToTable("guide_messages");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.ConversationId);
        });

        modelBuilder.Entity<DemoSession>(b =>
        {
            b.ToTable("demo_sessions");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.CurrentStep).HasConversion<string>();
            b.HasIndex(e => e.Status);
            b.HasMany(e => e.StepFeedbacks)
                .WithOne()
                .HasForeignKey(f => f.DemoSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            b.HasOne(e => e.OverallFeedback)
                .WithOne()
                .HasForeignKey<OverallFeedback>(f => f.DemoSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            b.Navigation(e => e.StepFeedbacks).UsePropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<StepFeedback>(b =>
        {
            b.ToTable("demo_step_feedbacks");
            b.HasKey(e => e.Id);
            b.Property(e => e.Step).HasConversion<string>();
            if (Database.ProviderName?.Contains("Npgsql") == true)
            {
                b.Property(e => e.Tags).HasColumnType("jsonb");
            }
            else
            {
                b.Property(e => e.Tags).HasConversion(
                    new ValueConverter<List<string>, string>(
                        v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                        v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>()));
            }

            b.HasIndex(e => e.DemoSessionId);
        });

        modelBuilder.Entity<OverallFeedback>(b =>
        {
            b.ToTable("demo_overall_feedbacks");
            b.HasKey(e => e.Id);
            if (Database.ProviderName?.Contains("Npgsql") == true)
            {
                b.Property(e => e.FeaturePriorities).HasColumnType("jsonb");
            }
            else
            {
                b.Property(e => e.FeaturePriorities).HasConversion(
                    new ValueConverter<List<string>, string>(
                        v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                        v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>()));
            }

            b.HasIndex(e => e.DemoSessionId).IsUnique();
        });

        modelBuilder.Entity<DemoInsight>(b =>
        {
            b.ToTable("demo_insights");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.GeneratedAt);
        });

        modelBuilder.Entity<EscalationQueueItem>(b =>
        {
            b.ToTable("escalation_queue");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.Level).HasConversion<string>();
            b.Property(e => e.SessionId).HasMaxLength(256).IsRequired();
            b.Property(e => e.ClaimedBy).HasMaxLength(256);
            b.Property(e => e.ResolutionNote).HasMaxLength(1024);
            b.HasIndex(e => e.Status);
            b.HasIndex(e => e.WorkflowId).IsUnique();
        });

        // ── Model governance tables ───────────────────────────────────────────

        modelBuilder.Entity<ModelRegistryEntry>(b =>
        {
            b.ToTable("model_registry_entries");
            b.HasKey(e => e.Id);
            b.Property(e => e.ModelName).HasMaxLength(128).IsRequired();
            b.Property(e => e.ModelVersion).HasMaxLength(64).IsRequired();
            b.Property(e => e.DeploymentName).HasMaxLength(128).IsRequired();
            b.Property(e => e.SkVersion).HasMaxLength(64);
            b.Property(e => e.PromptHash).HasMaxLength(64);
            b.Property(e => e.PluginManifest).HasMaxLength(2048);
            b.Property(e => e.EvalNotes).HasMaxLength(1024);
            b.Property(e => e.DeployedByUserId).HasMaxLength(256);
            b.HasIndex(e => e.DeployedAt);
            b.HasIndex(e => e.IsActive);
        });

        modelBuilder.Entity<PromptEvaluationRun>(b =>
        {
            b.ToTable("prompt_evaluation_runs");
            b.HasKey(e => e.Id);
            b.Property(e => e.EvaluatedByUserId).HasMaxLength(256);
            b.HasIndex(e => e.ModelRegistryEntryId);
            b.HasIndex(e => e.EvaluatedAt);
        });

        // ── Phase 6 — Agentic AI Maturity tables ─────────────────────────────

        modelBuilder.Entity<ReasoningAuditEntry>(b =>
        {
            b.ToTable("reasoning_audit_entries");
            b.HasKey(e => e.Id);
            b.Property(e => e.AgentName).HasMaxLength(128);
            b.Property(e => e.GuardVerdict).HasMaxLength(256);
            b.HasIndex(e => e.AgentDecisionId);
            b.HasIndex(e => e.CreatedAt);
        });

        modelBuilder.Entity<PromptExperimentOutcome>(b =>
        {
            b.ToTable("prompt_experiment_outcomes");
            b.HasKey(e => e.Id);
            b.Property(e => e.ExperimentId).HasMaxLength(128).IsRequired();
            b.Property(e => e.ControlOutput).HasMaxLength(512);
            b.Property(e => e.ChallengerOutput).HasMaxLength(512);
            b.HasIndex(e => e.ExperimentId);
            b.HasIndex(e => e.RecordedAt);
        });
    }
}
