using Dapr.Client;
using HealthQCopilot.Domain.Voice;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Voice.Infrastructure;
using HealthQCopilot.Voice.Services;
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
                new { session.Id, Status = session.Status.ToString() });
        });

        // Accept raw PCM audio (16-bit, 16 kHz, mono) as binary body.
        // Streams each chunk through Azure Speech SDK and returns the partial transcript.
        group.MapPost("/sessions/{id:guid}/audio-chunk", async (
            Guid id,
            HttpRequest request,
            VoiceDbContext db,
            ITranscriptionService transcription,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            if (session.Status == VoiceSessionStatus.Ended)
                return Results.BadRequest(new { error = "Session has already ended" });

            using var ms = new System.IO.MemoryStream();
            await request.Body.CopyToAsync(ms, ct);
            var audioBytes = ms.ToArray();

            if (audioBytes.Length == 0)
                return Results.BadRequest(new { error = "Audio chunk body is empty" });

            // Start continuous recognition on first chunk (idempotent inside service)
            if (session.Status == VoiceSessionStatus.Live)
                await transcription.StartContinuousRecognitionAsync(id, ct);

            var partial = await transcription.TranscribeAudioChunkAsync(id, audioBytes, ct);

            return Results.Ok(new { sessionId = id, partial });
        }).WithSummary("Stream a raw PCM audio chunk for real-time transcription")
          .Accepts<byte[]>("application/octet-stream");

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
            DaprClient dapr,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            session.ProduceTranscript(request.TranscriptText);
            await db.SaveChangesAsync(ct);

            // Publish transcript.produced — AI Agent Service subscribes to trigger triage
            _ = dapr.PublishEventAsync("pubsub", "transcript.produced",
                new { SessionId = id, request.TranscriptText }, CancellationToken.None);

            return Results.Ok(new { session.Id, Status = "TranscriptProduced" });
        });

        group.MapPost("/sessions/{id:guid}/end", async (
            Guid id,
            VoiceDbContext db,
            DaprClient dapr,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            session.End();
            await db.SaveChangesAsync(ct);

            // Publish session.ended — downstream services can react (scheduling, billing audit)
            _ = dapr.PublishEventAsync("pubsub", "session.ended",
                new { SessionId = id, session.EndedAt }, CancellationToken.None);

            return Results.Ok(new { session.Id, Status = session.Status.ToString() });
        });

        group.MapGet("/sessions", async (
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var sessions = await db.VoiceSessions
                .OrderByDescending(s => s.StartedAt)
                .Take(50)
                .Select(s => new { s.Id, s.PatientId, Status = s.Status.ToString(), s.StartedAt })
                .ToListAsync(ct);
            return Results.Ok(sessions);
        });

        return app;
    }
}

public record CreateSessionRequest(Guid PatientId);
public record ProduceTranscriptRequest(string TranscriptText);
