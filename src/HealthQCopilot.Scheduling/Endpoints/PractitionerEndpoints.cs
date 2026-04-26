using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HealthQCopilot.Scheduling.Endpoints;

public static class PractitionerEndpoints
{
    public static IEndpointRouteBuilder MapPractitionerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/scheduling/practitioners")
            .WithTags("Scheduling");

        group.MapGet("/", async (
            bool? activeOnly,
            string? specialty,
            SchedulingDbContext db,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            try
            {
                var query = db.Practitioners.AsQueryable();
                if (activeOnly ?? true)
                    query = query.Where(p => p.IsActive);
                if (!string.IsNullOrWhiteSpace(specialty))
                    query = query.Where(p => p.Specialty.Contains(specialty));

                var practitioners = await query
                    .OrderBy(p => p.Name)
                    .Select(p => new
                    {
                        p.Id,
                        p.PractitionerId,
                        p.Name,
                        p.Specialty,
                        p.Email,
                        AvailabilityStart = p.AvailabilityStart.ToString("HH:mm"),
                        AvailabilityEnd = p.AvailabilityEnd.ToString("HH:mm"),
                        p.TimeZoneId,
                        p.IsActive,
                        p.CreatedAt,
                        p.UpdatedAt,
                    })
                    .ToListAsync(ct);

                return Results.Ok(practitioners);
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                var logger = loggerFactory.CreateLogger("HealthQCopilot.Scheduling.PractitionerEndpoints");
                logger.LogWarning(ex,
                    "Practitioners table is missing in the scheduling database; returning an empty list as a compatibility fallback.");

                return Results.Ok(Array.Empty<object>());
            }
        }).WithSummary("List practitioners");

        group.MapGet("/{id:guid}", async (
            Guid id,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var p = await db.Practitioners.FindAsync([id], ct);
            if (p is null) return Results.NotFound();
            return Results.Ok(new
            {
                p.Id,
                p.PractitionerId,
                p.Name,
                p.Specialty,
                p.Email,
                AvailabilityStart = p.AvailabilityStart.ToString("HH:mm"),
                AvailabilityEnd = p.AvailabilityEnd.ToString("HH:mm"),
                p.TimeZoneId,
                p.IsActive,
                p.CreatedAt,
                p.UpdatedAt,
            });
        }).WithSummary("Get a practitioner by ID");

        group.MapPost("/", async (
            CreatePractitionerRequest request,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PractitionerId))
                return Results.BadRequest(new { error = "PractitionerId is required" });
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { error = "Name is required" });

            var exists = await db.Practitioners
                .AnyAsync(p => p.PractitionerId == request.PractitionerId, ct);
            if (exists)
                return Results.Conflict(new { error = "A practitioner with that ID already exists" });

            if (!TimeOnly.TryParse(request.AvailabilityStart, out var start))
                return Results.BadRequest(new { error = "Invalid AvailabilityStart format (HH:mm)" });
            if (!TimeOnly.TryParse(request.AvailabilityEnd, out var end))
                return Results.BadRequest(new { error = "Invalid AvailabilityEnd format (HH:mm)" });

            var practitioner = Practitioner.Create(
                request.PractitionerId,
                request.Name,
                request.Specialty ?? string.Empty,
                request.Email ?? string.Empty,
                start,
                end,
                request.TimeZoneId ?? "UTC");

            db.Practitioners.Add(practitioner);
            await db.SaveChangesAsync(ct);

            return Results.Created(
                $"/api/v1/scheduling/practitioners/{practitioner.Id}",
                new { practitioner.Id, practitioner.PractitionerId, practitioner.Name });
        }).WithSummary("Create a practitioner");

        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdatePractitionerRequest request,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var practitioner = await db.Practitioners.FindAsync([id], ct);
            if (practitioner is null) return Results.NotFound();

            if (!TimeOnly.TryParse(request.AvailabilityStart, out var start))
                return Results.BadRequest(new { error = "Invalid AvailabilityStart format (HH:mm)" });
            if (!TimeOnly.TryParse(request.AvailabilityEnd, out var end))
                return Results.BadRequest(new { error = "Invalid AvailabilityEnd format (HH:mm)" });

            practitioner.Update(
                request.Name ?? practitioner.Name,
                request.Specialty ?? practitioner.Specialty,
                request.Email ?? practitioner.Email,
                start,
                end,
                request.TimeZoneId ?? practitioner.TimeZoneId);

            if (request.IsActive.HasValue)
            {
                if (request.IsActive.Value) practitioner.Activate();
                else practitioner.Deactivate();
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { practitioner.Id, practitioner.Name, practitioner.IsActive });
        }).WithSummary("Update a practitioner");

        group.MapDelete("/{id:guid}", async (
            Guid id,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var practitioner = await db.Practitioners.FindAsync([id], ct);
            if (practitioner is null) return Results.NotFound();
            practitioner.Deactivate();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).WithSummary("Deactivate a practitioner");

        return app;
    }
}

public sealed record CreatePractitionerRequest(
    string PractitionerId,
    string Name,
    string? Specialty,
    string? Email,
    string AvailabilityStart,
    string AvailabilityEnd,
    string? TimeZoneId);

public sealed record UpdatePractitionerRequest(
    string? Name,
    string? Specialty,
    string? Email,
    string AvailabilityStart,
    string AvailabilityEnd,
    string? TimeZoneId,
    bool? IsActive);
