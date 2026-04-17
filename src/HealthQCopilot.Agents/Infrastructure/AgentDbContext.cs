using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Infrastructure;

public class AgentDbContext : OutboxDbContext
{
    public DbSet<TriageWorkflow> TriageWorkflows => Set<TriageWorkflow>();
    public DbSet<AgentDecision> AgentDecisions => Set<AgentDecision>();
    public DbSet<GuideConversation> GuideConversations => Set<GuideConversation>();
    public DbSet<GuideMessage> GuideMessages => Set<GuideMessage>();

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
    }
}
