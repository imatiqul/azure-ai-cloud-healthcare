using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Scheduling.Infrastructure;

public class SchedulingDbContext : OutboxDbContext
{
    public DbSet<Slot> Slots => Set<Slot>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<WaitlistEntry> WaitlistEntries => Set<WaitlistEntry>();

    public SchedulingDbContext(DbContextOptions<SchedulingDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Slot>(b =>
        {
            b.ToTable("slots");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.PractitionerId).HasMaxLength(128).IsRequired();
            b.Property(e => e.Version).IsRowVersion();
        });

        modelBuilder.Entity<Booking>(b =>
        {
            b.ToTable("bookings");
            b.HasKey(e => e.Id);
            b.HasIndex(e => e.SlotId).IsUnique();
        });

        modelBuilder.Entity<WaitlistEntry>(b =>
        {
            b.ToTable("waitlist_entries");
            b.HasKey(e => e.Id);
            b.Property(e => e.Status).HasConversion<string>();
            b.Property(e => e.PatientId).HasMaxLength(128).IsRequired();
            b.Property(e => e.PractitionerId).HasMaxLength(128).IsRequired();
            b.HasIndex(e => new { e.PatientId, e.Status });
            b.HasIndex(e => new { e.PractitionerId, e.Status });
        });
    }
}
