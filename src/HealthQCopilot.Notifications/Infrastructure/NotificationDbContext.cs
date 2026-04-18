using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Notifications.Infrastructure;

public class NotificationDbContext : OutboxDbContext
{
    public DbSet<OutreachCampaign> OutreachCampaigns => Set<OutreachCampaign>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<WebPushSubscription> WebPushSubscriptions => Set<WebPushSubscription>();

    public NotificationDbContext(DbContextOptions<NotificationDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<OutreachCampaign>(b =>
        {
            b.ToTable("outreach_campaigns");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.Type).HasConversion<string>();
        });

        modelBuilder.Entity<Message>(b =>
        {
            b.ToTable("messages");
            b.HasKey(e => e.Id);
            b.Property(e => e.Channel).HasConversion<string>();
            b.Property(e => e.Status).HasConversion<string>();
            b.HasIndex(e => e.CampaignId);
        });
    }
}
