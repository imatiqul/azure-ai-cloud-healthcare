using Dapr;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.PopulationHealth.Infrastructure;
using HealthQCopilot.PopulationHealth.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.PopulationHealth.Controllers;

/// <summary>
/// Dapr subscriber: reacts to triage events and re-calculates patient risk scores.
/// Implements the "Triage → Risk Reassessment" arm of the clinical workflow.
/// </summary>
[ApiController]
public class PopHealthSubscriberController : ControllerBase
{
    private readonly PopHealthDbContext _db;
    private readonly RiskCalculationService _riskCalculator;
    private readonly ILogger<PopHealthSubscriberController> _logger;

    public PopHealthSubscriberController(
        PopHealthDbContext db,
        RiskCalculationService riskCalculator,
        ILogger<PopHealthSubscriberController> logger)
    {
        _db = db;
        _riskCalculator = riskCalculator;
        _logger = logger;
    }

    /// <summary>
    /// When AI triage completes, reassess the patient's population-health risk score
    /// using the triage level as an additional signal.
    /// </summary>
    [Topic("pubsub", "triage.completed")]
    [HttpPost("/dapr/sub/pophealth/triage-completed")]
    public async Task<IActionResult> HandleTriageCompleted(
        [FromBody] TriageCompletedForRisk payload,
        CancellationToken ct)
    {
        _logger.LogInformation(
            "PopHealth received triage.completed for session {SessionId} level {Level}",
            payload.SessionId, payload.Level);

        if (string.IsNullOrWhiteSpace(payload.PatientId))
        {
            _logger.LogWarning("triage.completed has no PatientId — cannot reassess risk");
            return Ok();
        }

        // Load the most-recent risk record for this patient
        var existing = await _db.PatientRisks
            .Where(r => r.PatientId == payload.PatientId)
            .OrderByDescending(r => r.AssessedAt)
            .FirstOrDefaultAsync(ct);

        var existingFactors = existing?.RiskFactors ?? [];
        var newFactors = payload.RiskFactors ?? [];

        var updated = _riskCalculator.Recalculate(
            payload.PatientId, existingFactors, newFactors, payload.Level);

        _db.PatientRisks.Add(updated);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Risk reassessed for patient {PatientId}: {Score} ({Level})",
            payload.PatientId, updated.RiskScore, updated.Level);

        return Ok();
    }

    /// <summary>
    /// On escalation.required, flag the patient as Critical risk.
    /// A P1/P2 escalation always warrants a critical risk marker.
    /// </summary>
    [Topic("pubsub", "escalation.required")]
    [HttpPost("/dapr/sub/pophealth/escalation-required")]
    public async Task<IActionResult> HandleEscalationRequired(
        [FromBody] EscalationForRisk payload,
        CancellationToken ct)
    {
        _logger.LogInformation(
            "PopHealth received escalation.required for session {SessionId}", payload.SessionId);

        if (string.IsNullOrWhiteSpace(payload.PatientId))
            return Ok();

        // Escalated patients are always Critical risk until reassessed
        var risk = PatientRisk.Create(
            payload.PatientId,
            RiskLevel.Critical,
            0.95,
            "escalation-override",
            ["Escalated — P1/P2 triage level"]);

        _db.PatientRisks.Add(risk);
        await _db.SaveChangesAsync(ct);

        return Ok();
    }
}

public record TriageCompletedForRisk(
    Guid WorkflowId,
    string? SessionId,
    string? PatientId,
    string? Level,
    List<string>? RiskFactors);

public record EscalationForRisk(
    Guid WorkflowId,
    string? SessionId,
    string? PatientId,
    string? Level);
