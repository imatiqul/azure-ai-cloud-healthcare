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

            // Accumulate partial text so ending the session can publish a full transcript
            if (!string.IsNullOrWhiteSpace(partial))
            {
                session.AppendTranscript(partial);
                await db.SaveChangesAsync(ct);
            }

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
                new { SessionId = id, request.TranscriptText, session.PatientId }, CancellationToken.None);

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
            // NOTE: transcript.produced is NOT published here. The user must explicitly call
            // POST /sessions/{id}/transcript to submit the transcript for AI triage.
            _ = dapr.PublishEventAsync("pubsub", "session.ended",
                new { SessionId = id, session.EndedAt }, CancellationToken.None);

            return Results.Ok(new { session.Id, Status = session.Status.ToString() });
        });

        group.MapGet("/sessions", async (
            string? patientId,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var query = db.VoiceSessions.AsQueryable();
            if (!string.IsNullOrWhiteSpace(patientId))
                query = query.Where(s => s.PatientId == patientId);
            var sessions = await query
                .OrderByDescending(s => s.StartedAt)
                .Take(50)
                .Select(s => new
                {
                    s.Id,
                    s.PatientId,
                    Status = s.Status.ToString(),
                    s.StartedAt,
                    EndedAt = (DateTime?)s.EndedAt,
                    HasTranscript = s.TranscriptText != null && s.TranscriptText.Length > 0,
                })
                .ToListAsync(ct);
            return Results.Ok(sessions);
        }).WithSummary("List voice sessions")
          .WithDescription("Returns up to 50 voice sessions ordered by start time descending. Optionally filter by patientId.");

        // ── SOAP Note generation ──────────────────────────────────────────────
        // Derives a structured SOAP note from the accumulated session transcript.
        // Rule-based extraction; in production augment with Azure OpenAI GPT-4o structured output.
        group.MapGet("/sessions/{id:guid}/soap-note", async (
            Guid id,
            VoiceDbContext db,
            CancellationToken ct) =>
        {
            var session = await db.VoiceSessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(session.TranscriptText))
                return Results.BadRequest(new { error = "Session has no transcript yet" });

            var note = SoapNoteExtractor.Extract(session.Id, session.PatientId, session.TranscriptText!);
            return Results.Ok(note);
        }).WithSummary("Generate SOAP note from voice session transcript")
          .WithDescription("Returns a Subjective/Objective/Assessment/Plan structured note derived from the session transcript.");

        return app;
    }
}

/// <summary>
/// Rule-based SOAP note extractor. Maps key clinical phrases in the transcript
/// to SOAP sections. Designed for graceful fallback when Azure OpenAI is unavailable.
/// </summary>
file static class SoapNoteExtractor
{
    public static SoapNoteResult Extract(Guid sessionId, string patientId, string transcript)
    {
        var lower = transcript.ToLowerInvariant();
        var lines = transcript.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        // ── Subjective — patient-reported symptoms ───────────────────────────
        var subjKeywords = new[] { "patient reported", "patient states", "complains of", "chief complaint",
            "presents with", "symptoms include", "history of" };
        var subjLines = lines.Where(l => subjKeywords.Any(k => l.ToLowerInvariant().Contains(k))).ToList();
        var subjective = subjLines.Count > 0
            ? string.Join(" ", subjLines)
            : ExtractAfter(transcript, "patient", 200) ?? "See transcript.";

        // ── Objective — vitals and measurable findings ───────────────────────
        var objKeywords = new[] { "bp ", "blood pressure", "hr ", "heart rate", "o2", "spo2", "temperature",
            "weight", "bmi", "rr ", "respiratory rate", "pulse" };
        var objLines = lines.Where(l => objKeywords.Any(k => l.ToLowerInvariant().Contains(k))).ToList();
        var objective = objLines.Count > 0
            ? string.Join(" ", objLines)
            : "Vitals not documented in transcript.";

        // ── Assessment — clinician impression ───────────────────────────────
        var assKeywords = new[] { "assessment", "impression", "diagnosis", "suspected", "consistent with",
            "likely", "rule out", "differential" };
        var assLines = lines.Where(l => assKeywords.Any(k => l.ToLowerInvariant().Contains(k))).ToList();
        var assessment = assLines.Count > 0
            ? string.Join(" ", assLines)
            : "Pending clinician review.";

        // ── Plan — orders and follow-up ──────────────────────────────────────
        var planKeywords = new[] { "ordered", "referral", "follow", "prescribed", "started on", "initiat",
            "schedule", "recommend", "labs", "medication", "mg ", "dose" };
        var planLines = lines.Where(l => planKeywords.Any(k => l.ToLowerInvariant().Contains(k))).ToList();
        var plan = planLines.Count > 0
            ? string.Join(" ", planLines)
            : "Plan to be documented by clinician.";

        return new SoapNoteResult(
            SessionId: sessionId,
            PatientId: patientId,
            Subjective: subjective.Trim(),
            Objective: objective.Trim(),
            Assessment: assessment.Trim(),
            Plan: plan.Trim(),
            GeneratedAt: DateTime.UtcNow);
    }

    private static string? ExtractAfter(string text, string keyword, int maxLength)
    {
        var idx = text.IndexOf(keyword, StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return null;
        var start = idx;
        var length = Math.Min(maxLength, text.Length - start);
        return text.Substring(start, length);
    }
}

public sealed record SoapNoteResult(
    Guid SessionId,
    string PatientId,
    string Subjective,
    string Objective,
    string Assessment,
    string Plan,
    DateTime GeneratedAt);

public record CreateSessionRequest(Guid PatientId);
public record ProduceTranscriptRequest(string TranscriptText);
