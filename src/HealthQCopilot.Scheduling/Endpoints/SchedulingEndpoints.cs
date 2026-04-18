using System.Text.Json;
using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.Scheduling.Endpoints;

public static class SchedulingEndpoints
{
    public static IEndpointRouteBuilder MapSchedulingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/scheduling")
            .WithTags("Scheduling")
            .WithAutoValidation();

        group.MapGet("/slots", async (
            DateOnly? date,
            Guid? practitionerId,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Slots.Where(s => s.Status == SlotStatus.Available);
            if (date.HasValue)
            {
                var start = date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var end = start.AddDays(1);
                query = query.Where(s => s.StartTime >= start && s.StartTime < end);
            }
            if (practitionerId.HasValue)
                query = query.Where(s => s.PractitionerId == practitionerId.Value.ToString());
            var slots = await query.OrderBy(s => s.StartTime).Take(100)
                .Select(s => new { s.Id, s.PractitionerId, s.StartTime, s.EndTime, s.Status })
                .ToListAsync(ct);
            return Results.Ok(slots);
        });

        group.MapPost("/slots/{id:guid}/reserve", async (
            Guid id,
            ReserveSlotRequest request,
            SchedulingDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var slot = await db.Slots.FindAsync([id], ct);
            if (slot is null) return Results.NotFound();
            slot.Reserve(request.PatientId.ToString());
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);
            return Results.Ok(new { slot.Id, slot.Status });
        });

        group.MapDelete("/slots/{id:guid}/reserve", async (
            Guid id,
            SchedulingDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var slot = await db.Slots.FindAsync([id], ct);
            if (slot is null) return Results.NotFound();
            slot.Release();
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);
            return Results.Ok(new { slot.Id, slot.Status });
        });

        group.MapPost("/bookings", async (
            CreateBookingRequest request,
            SchedulingDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var slot = await db.Slots.FindAsync([request.SlotId], ct);
            if (slot is null) return Results.NotFound("Slot not found");
            slot.Book();
            var booking = Booking.Create(
                request.SlotId, request.PatientId.ToString(),
                request.PractitionerId.ToString(), slot.StartTime);
            db.Bookings.Add(booking);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);
            return Results.Created($"/api/v1/scheduling/bookings/{booking.Id}",
                new { booking.Id, booking.SlotId, booking.PatientId });
        });

        group.MapGet("/bookings/{id:guid}", async (
            Guid id,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var booking = await db.Bookings.FindAsync([id], ct);
            return booking is null ? Results.NotFound() : Results.Ok(booking);
        });

        group.MapGet("/stats", async (
            SchedulingDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            const string cacheKey = "healthq:scheduling:stats";
            var cached = await cache.GetAsync(cacheKey, ct);
            if (cached is not null)
                return Results.Ok(JsonSerializer.Deserialize<object>(cached));

            var today = DateTime.UtcNow.Date;
            var tomorrow = today.AddDays(1);
            var availableToday = await db.Slots.CountAsync(s => s.Status == SlotStatus.Available && s.StartTime >= today && s.StartTime < tomorrow, ct);
            var bookedToday = await db.Slots.CountAsync(s => s.Status == SlotStatus.Booked && s.StartTime >= today && s.StartTime < tomorrow, ct);
            var totalBookings = await db.Bookings.CountAsync(ct);
            var stats = new { AvailableToday = availableToday, BookedToday = bookedToday, TotalBookings = totalBookings };

            await cache.SetAsync(cacheKey, JsonSerializer.SerializeToUtf8Bytes(stats),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) }, ct);

            return Results.Ok(stats);
        });

        return app;
    }
}

public record CreateBookingRequest(Guid SlotId, Guid PatientId, Guid PractitionerId);
public record ReserveSlotRequest(Guid PatientId);
