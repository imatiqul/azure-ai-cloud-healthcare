using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Scheduling.BackgroundServices;

/// <summary>
/// Ensures appointment slots exist for the next 7 days for all practitioners.
/// Runs on startup and then once per hour.
/// </summary>
public sealed class SlotGenerationService : BackgroundService
{
    private static readonly string[] Practitioners = ["DR-001", "DR-002", "DR-003"];
    private const int DaysAhead = 7;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SlotGenerationService> _logger;

    public SlotGenerationService(IServiceScopeFactory scopeFactory, ILogger<SlotGenerationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Run immediately on startup, then every hour
        while (!ct.IsCancellationRequested)
        {
            await GenerateSlotsAsync(ct);
            try
            {
                await Task.Delay(TimeSpan.FromHours(1), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task GenerateSlotsAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SchedulingDbContext>();

            var today = DateTime.UtcNow.Date;
            var newSlots = new List<Slot>();

            foreach (var practitioner in Practitioners)
            {
                for (var dayOffset = 0; dayOffset < DaysAhead; dayOffset++)
                {
                    var date = today.AddDays(dayOffset);

                    // Check if slots already exist for this practitioner on this date
                    var hasSlots = await db.Slots
                        .AnyAsync(s => s.PractitionerId == practitioner
                            && s.StartTime >= date
                            && s.StartTime < date.AddDays(1), ct);

                    if (hasSlots) continue;

                    // Generate 30-minute slots from 09:00 to 17:00 (16 slots per practitioner per day)
                    for (var hour = 9; hour < 17; hour++)
                    {
                        newSlots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                            date.AddHours(hour), date.AddHours(hour).AddMinutes(30)));
                        newSlots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                            date.AddHours(hour).AddMinutes(30), date.AddHours(hour + 1)));
                    }
                }
            }

            if (newSlots.Count > 0)
            {
                db.Slots.AddRange(newSlots);
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("Generated {Count} new appointment slots for the next {Days} days", newSlots.Count, DaysAhead);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Error generating appointment slots");
        }
    }
}
