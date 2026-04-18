using HealthQCopilot.Domain.Voice;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Voice.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Voice.Endpoints;

public static class VoiceEndpoints
{
    public static IEndpointRouteBuilder MapVoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/voice")
            .WithTags("Voice")
            .WithAutoValidation();

        group.MapPost("/sessions", async (
            CreateSessionRequest request,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var session = VoiceSession.Start(request.PatientId.ToString());
            db.VoiceSessions.Add(session);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/voice/sessions/{session.Id}",
                new { session.Id, session.Status });
        });

        group.MapGet("/sessions/{id:guid}", async (
            Guid id,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            return session is null ? Results.NotFound() : Results.Ok(session);
        });

        group.MapPost("/sessions/{id:guid}/transcript", async (
            Guid id,
            ProduceTranscriptRequest request,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            session.ProduceTranscript(request.TranscriptText);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { session.Id, Status = "TranscriptProduced" });
        });

        group.MapPost("/sessions/{id:guid}/end", async (
            Guid id,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            session.End();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { session.Id, session.Status });
        });

        group.MapGet("/sessions", async (
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var sessions = await db.VoiceSessions
                .OrderByDescending(s => s.StartedAt)
                .Take(50)
                .Select(s => new { s.Id, s.PatientId, s.Status, s.StartedAt })
                .ToListAsync(ct);
            return Results.Ok(sessions);
        });

        return app;
    }
}

public record CreateSessionRequest(Guid PatientId);
public record ProduceTranscriptRequest(string TranscriptText);
