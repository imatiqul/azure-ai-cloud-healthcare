using Dapr;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Infrastructure.Messaging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Controllers;

/// <summary>
/// Dapr subscriber controller for AI Agent Service.
/// Subscribes to transcript events from Voice Service and wires them into TriageOrchestrator.
/// </summary>
[ApiController]
public class AgentSubscriberController : ControllerBase
{
    private readonly TriageOrchestrator _orchestrator;
    private readonly ILogger<AgentSubscriberController> _logger;

    public AgentSubscriberController(
        TriageOrchestrator orchestrator,
        ILogger<AgentSubscriberController> logger)
    {
        _orchestrator = orchestrator;
        _logger = logger;
    }

    /// <summary>
    /// Voice Service publishes transcript.produced when a VoiceSession transcription completes.
    /// This kicks off the automated AI triage pipeline without manual REST invocation.
    /// </summary>
    [Topic("pubsub", "transcript.produced")]
    [HttpPost("/dapr/sub/transcript-produced")]
    public async Task<IActionResult> HandleTranscriptProduced(
        [FromBody] TranscriptProducedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation(
            "Received transcript.produced for session {SessionId} ({Chars} chars)",
            payload.SessionId, payload.TranscriptText?.Length ?? 0);

        if (string.IsNullOrWhiteSpace(payload.TranscriptText))
        {
            _logger.LogWarning("transcript.produced for session {SessionId} had empty text — skipping triage",
                payload.SessionId);
            return Ok();
        }

        try
        {
            var workflow = await _orchestrator.RunTriageAsync(
                payload.SessionId, payload.TranscriptText, ct);

            _logger.LogInformation(
                "Triage workflow {WorkflowId} created for session {SessionId} — level {Level}",
                workflow.Id, payload.SessionId, workflow.AssignedLevel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to run triage for session {SessionId}", payload.SessionId);
            // Return 500 so Dapr retries; non-transient errors should not block the bus
            return StatusCode(500);
        }

        return Ok();
    }

    /// <summary>
    /// Voice Service publishes session.ended when a VoiceSession closes.
    /// AI Agent Service logs the session completion and can chain downstream actions.
    /// </summary>
    [Topic("pubsub", "session.ended")]
    [HttpPost("/dapr/sub/session-ended")]
    public IActionResult HandleSessionEnded(
        [FromBody] SessionEndedEvent payload)
    {
        _logger.LogInformation(
            "Session {SessionId} ended — duration {Duration}",
            payload.SessionId, payload.Duration);

        // Audit log and potential downstream workflow chaining are handled by outbox/audit
        // Returning Ok is sufficient — the outbox relay handles durable publishing
        return Ok();
    }
}

public record TranscriptProducedEvent(Guid SessionId, string TranscriptText);
public record SessionEndedEvent(Guid SessionId, TimeSpan Duration);
