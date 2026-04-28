using System.Text.Json;
using Dapr.Client;
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
                .Select(s => new { s.Id, s.PractitionerId, s.StartTime, s.EndTime, Status = s.Status.ToString() })
                .ToListAsync(ct);
            return Results.Ok(slots);
        });

        group.MapPost("/slots/{id:guid}/reserve", async (
            Guid id,
            SchedulingDbContext db,
            IDistributedCache cache,
            CancellationToken ct,
            ReserveSlotRequest? request = null) =>
        {
            var slot = await db.Slots.FindAsync([id], ct);
            if (slot is null) return Results.NotFound();
            var patientId = request?.PatientId ?? Guid.Parse("00000000-0000-0000-0000-000000000001");
            slot.Reserve(patientId.ToString());
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);
            return Results.Ok(new { slot.Id, Status = slot.Status.ToString() });
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
            DaprClient dapr,
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

            // Publish event so Notifications and FHIR services can react
            _ = Task.Run(async () =>
            {
                try
                {
                    await dapr.PublishEventAsync("pubsub", "scheduling.slot.booked", new
                    {
                        BookingId = booking.Id,
                        SlotId = booking.SlotId,
                        PatientId = booking.PatientId,
                        PractitionerId = booking.PractitionerId,
                        AppointmentTime = booking.AppointmentTime
                    });
                }
                catch { /* non-critical — booking already saved */ }
            }, CancellationToken.None);

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

        // ── GET /bookings — list recent bookings (activity feed, dashboards) ─
        group.MapGet("/bookings", async (
            int? top,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var bookings = await db.Bookings
                .OrderByDescending(b => b.AppointmentTime)
                .Take(top ?? 20)
                .Select(b => new
                {
                    b.Id,
                    b.PatientId,
                    ProviderId = b.PractitionerId,
                    b.SlotId,
                    AppointmentType = "Outpatient",
                    b.AppointmentTime,
                    Status = b.Status.ToString(),
                    ScheduledAt = b.CreatedAt,
                })
                .ToListAsync(ct);
            return Results.Ok(bookings);
        }).WithSummary("List recent bookings")
          .WithDescription("Returns the most recent bookings ordered by appointment time descending. Use ?top=N to limit results (default 20).");

        // ── GET /appointments — BFF-friendly alias for /bookings ─────────────
        // Returns the same projection as /bookings but in the AppointmentDto shape
        // expected by the BFF GraphQL layer (propertyCasing aligned).
        group.MapGet("/appointments", async (
            string? patientId,
            int? top,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Bookings.AsQueryable();
            if (!string.IsNullOrWhiteSpace(patientId))
                query = query.Where(b => b.PatientId == patientId);
            var appointments = await query
                .OrderByDescending(b => b.AppointmentTime)
                .Take(Math.Clamp(top ?? 50, 1, 100))
                .Select(b => new
                {
                    Id = b.Id.ToString(),
                    b.PatientId,
                    ProviderId = b.PractitionerId,
                    AppointmentType = "Outpatient",
                    Status = b.Status.ToString(),
                    ScheduledAt = b.AppointmentTime.ToString("o"),
                })
                .ToListAsync(ct);
            return Results.Ok(appointments);
        }).WithSummary("List appointments (BFF alias)")
          .WithDescription("Alias for /bookings returning AppointmentDto-compatible shape for GraphQL BFF layer.");

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

        // ── Booking reschedule (Phase 30) ────────────────────────────────────
        group.MapPut("/bookings/{id:guid}/reschedule", async (
            Guid id,
            RescheduleBookingRequest request,
            SchedulingDbContext db,
            DaprClient dapr,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var booking = await db.Bookings.FindAsync([id], ct);
            if (booking is null) return Results.NotFound("Booking not found");
            if (booking.Status == BookingStatus.Cancelled)
                return Results.BadRequest(new { error = "Cannot reschedule a cancelled booking" });

            var newSlot = await db.Slots.FindAsync([request.NewSlotId], ct);
            if (newSlot is null) return Results.NotFound("New slot not found");
            if (newSlot.Status != SlotStatus.Available)
                return Results.Conflict(new { error = "The requested slot is not available" });

            // Release old slot
            var oldSlot = await db.Slots.FindAsync([booking.SlotId], ct);
            oldSlot?.Release();

            // Reserve and book new slot
            newSlot.Reserve(booking.PatientId);
            newSlot.Book();

            // Update the booking
            booking.Reschedule(request.NewSlotId, newSlot.StartTime);

            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);

            _ = Task.Run(async () =>
            {
                try
                {
                    await dapr.PublishEventAsync("pubsub", "scheduling.booking.rescheduled", new
                    {
                        BookingId = booking.Id,
                        NewSlotId = request.NewSlotId,
                        PatientId = booking.PatientId,
                        PractitionerId = booking.PractitionerId,
                        NewAppointmentTime = newSlot.StartTime,
                    });
                }
                catch { /* non-critical */ }
            }, CancellationToken.None);

            return Results.Ok(new { booking.Id, booking.SlotId, AppointmentTime = newSlot.StartTime });
        }).WithSummary("Reschedule a booking to a new slot");

        // ── Booking cancel (Phase 30) ────────────────────────────────────────
        group.MapDelete("/bookings/{id:guid}", async (
            Guid id,
            SchedulingDbContext db,
            DaprClient dapr,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var booking = await db.Bookings.FindAsync([id], ct);
            if (booking is null) return Results.NotFound();

            var cancelResult = booking.Cancel();
            if (!cancelResult.IsSuccess)
                return Results.BadRequest(new { error = cancelResult.Error });

            // Release the slot back to available
            var slot = await db.Slots.FindAsync([booking.SlotId], ct);
            slot?.Release();

            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:scheduling:stats", ct);

            _ = Task.Run(async () =>
            {
                try
                {
                    await dapr.PublishEventAsync("pubsub", "scheduling.booking.cancelled", new
                    {
                        BookingId = booking.Id,
                        PatientId = booking.PatientId,
                        PractitionerId = booking.PractitionerId,
                    });
                }
                catch { /* non-critical */ }
            }, CancellationToken.None);

            return Results.NoContent();
        }).WithSummary("Cancel a booking");

        return app;
    }
}

public record CreateBookingRequest(Guid SlotId, Guid PatientId, Guid PractitionerId);
public record ReserveSlotRequest(Guid PatientId);
public record RescheduleBookingRequest(Guid NewSlotId);
