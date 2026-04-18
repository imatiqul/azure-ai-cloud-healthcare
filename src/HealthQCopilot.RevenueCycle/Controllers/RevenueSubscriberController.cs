using Dapr;
using Dapr.Client;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.RevenueCycle.Infrastructure;
using HealthQCopilot.RevenueCycle.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.RevenueCycle.Controllers;

[ApiController]
public class RevenueSubscriberController : ControllerBase
{
    private readonly RevenueDbContext _db;
    private readonly CodeSuggestionService _codeSuggestion;
    private readonly DaprClient _dapr;
    private readonly ILogger<RevenueSubscriberController> _logger;

    public RevenueSubscriberController(
        RevenueDbContext db,
        CodeSuggestionService codeSuggestion,
        DaprClient dapr,
        ILogger<RevenueSubscriberController> logger)
    {
        _db = db;
        _codeSuggestion = codeSuggestion;
        _dapr = dapr;
        _logger = logger;
    }

    /// <summary>
    /// When a triage workflow completes, automatically create an ICD-10 coding job.
    /// This Dapr subscription provides a resilient, at-least-once delivery path alongside
    /// the HTTP dispatch from WorkflowDispatcher. Duplicate detection is based on EncounterId.
    /// </summary>
    [Topic("pubsub", "triage.completed")]
    [HttpPost("/dapr/sub/revenue-triage-completed")]
    public async Task<IActionResult> HandleTriageCompleted(
        [FromBody] TriageCompletedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Revenue received triage.completed for session {SessionId} level {Level}",
            payload.SessionId, payload.Level);

        var encounterId = $"ENC-{payload.SessionId[..Math.Min(8, payload.SessionId.Length)]}";

        // Idempotency: skip if a coding job for this encounter already exists
        var exists = await _db.CodingJobs
            .AnyAsync(j => j.EncounterId == encounterId, ct);

        if (exists)
        {
            _logger.LogDebug("Coding job for encounter {EncounterId} already exists; skipping duplicate", encounterId);
            return Ok(new { skipped = true });
        }

        var codes = _codeSuggestion.SuggestCodes(payload.Level ?? "P3_Standard", payload.Reasoning ?? string.Empty);
        var job = CodingJob.Create(
            encounterId,
            $"PAT-{payload.SessionId[..Math.Min(8, payload.SessionId.Length)]}",
            "AI-Triaged Patient",
            codes);

        _db.CodingJobs.Add(job);
        await _db.SaveChangesAsync(ct);

        // Publish CodingJobCreated via Dapr pub/sub so downstream services (notifications, pop-health) can react
        await _dapr.PublishEventAsync("pubsub", "revenue.coding-job.created", new
        {
            job.Id,
            job.EncounterId,
            job.PatientId,
            SuggestedCodes = codes,
            TriageLevel = payload.Level,
            CreatedAt = DateTime.UtcNow
        }, ct);

        _logger.LogInformation("Coding job {JobId} created for encounter {EncounterId} via Dapr subscription",
            job.Id, encounterId);

        return Ok(new { jobId = job.Id });
    }

    /// <summary>
    /// Publish PriorAuthApproved to Dapr pub/sub so the Notification service can alert the patient.
    /// Called from RevenueEndpoints after a prior auth is approved.
    /// </summary>
    [Topic("pubsub", "revenue.prior-auth.status-changed")]
    [HttpPost("/dapr/sub/revenue-prior-auth-status")]
    public async Task<IActionResult> HandlePriorAuthStatusChanged(
        [FromBody] PriorAuthStatusEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Revenue received prior-auth status change {AuthId} → {Status}",
            payload.AuthId, payload.Status);

        // Re-publish with the canonical topic so notification service picks it up
        var topicName = payload.Status == "Approved"
            ? "revenue.prior-auth.approved"
            : "revenue.prior-auth.denied";

        await _dapr.PublishEventAsync("pubsub", topicName, payload, ct);

        return Ok();
    }
}

public record TriageCompletedEvent(Guid WorkflowId, string SessionId, string? Level, string? Reasoning);
public record PriorAuthStatusEvent(Guid AuthId, string PatientId, string Status, string? DenialReason);
