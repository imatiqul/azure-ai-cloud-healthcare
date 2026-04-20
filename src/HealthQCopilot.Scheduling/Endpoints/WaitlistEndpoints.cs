using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Scheduling.Infrastructure;
using HealthQCopilot.Scheduling.Services;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Scheduling.Endpoints;

public static class WaitlistEndpoints
{
    public static IEndpointRouteBuilder MapWaitlistEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/scheduling/waitlist")
            .WithTags("Scheduling — Waitlist")
            .WithAutoValidation();

        // ── POST /waitlist — add patient to waitlist ─────────────────────────
        group.MapPost("/", async (
            WaitlistEntryRequest request,
            WaitlistService svc,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId))
                return Results.BadRequest("PatientId is required");
            if (string.IsNullOrWhiteSpace(request.PractitionerId))
                return Results.BadRequest("PractitionerId is required");
            if (request.Priority is < 1 or > 5)
                return Results.BadRequest("Priority must be between 1 and 5");

            var id = await svc.EnqueueAsync(
                request.PatientId,
                request.PractitionerId,
                request.PreferredDateFrom,
                request.PreferredDateTo,
                request.Priority,
                request.Reason,
                ct);

            return Results.Created($"/api/v1/scheduling/waitlist/{id}", new { id });
        })
        .WithSummary("Add patient to scheduling waitlist")
        .WithDescription(
            "Enqueues a patient for the next available slot with the specified practitioner " +
            "in the preferred date window. Priority 1 = urgent, 5 = routine.");

        // ── GET /waitlist/{patientId} — patient's waiting entries ─────────────
        group.MapGet("/{patientId}", async (
            string patientId,
            WaitlistService svc,
            CancellationToken ct) =>
        {
            var entries = await svc.GetPatientWaitlistAsync(patientId, ct);
            return Results.Ok(entries.Select(e => new
            {
                e.Id,
                e.PatientId,
                e.PractitionerId,
                PreferredDateFrom = e.PreferredDateFrom.ToString("yyyy-MM-dd"),
                PreferredDateTo = e.PreferredDateTo.ToString("yyyy-MM-dd"),
                e.Priority,
                e.Reason,
                Status = e.Status.ToString(),
                e.CreatedAt,
            }));
        })
        .WithSummary("Get waitlist entries for a patient");

        // ── DELETE /waitlist/{id} — cancel a waitlist entry ──────────────────
        group.MapDelete("/{id:guid}", async (
            Guid id,
            SchedulingDbContext db,
            CancellationToken ct) =>
        {
            var entry = await db.WaitlistEntries.FindAsync([id], ct);
            if (entry is null) return Results.NotFound();

            var result = entry.Cancel();
            if (!result.IsSuccess) return Results.BadRequest(result.Error);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { entry.Id, Status = entry.Status.ToString() });
        })
        .WithSummary("Cancel a waitlist entry");

        // ── POST /waitlist/conflict-check — validate scheduling conflict ──────
        group.MapPost("/conflict-check", async (
            ConflictCheckRequest request,
            WaitlistService svc,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId))
                return Results.BadRequest("PatientId is required");

            var hasConflict = await svc.HasConflictAsync(
                request.PatientId, request.StartTime, request.EndTime, ct);

            return Results.Ok(new { request.PatientId, request.StartTime, request.EndTime, HasConflict = hasConflict });
        })
        .WithSummary("Check for scheduling conflicts for a patient")
        .WithDescription(
            "Returns whether the patient already has a confirmed booking overlapping " +
            "the proposed [startTime, endTime) window. Used by the booking UI before " +
            "presenting slots to the patient.");

        return app;
    }
}

public record WaitlistEntryRequest(
    string PatientId,
    string PractitionerId,
    DateOnly PreferredDateFrom,
    DateOnly PreferredDateTo,
    int Priority = 5,
    string? Reason = null);

public record ConflictCheckRequest(
    string PatientId,
    DateTime StartTime,
    DateTime EndTime);
