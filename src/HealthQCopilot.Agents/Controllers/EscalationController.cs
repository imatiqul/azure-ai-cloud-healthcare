using Dapr;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Domain.Agents;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Controllers;

[ApiController]
public class EscalationController : ControllerBase
{
    private readonly AgentDbContext _db;
    private readonly ILogger<EscalationController> _logger;

    public EscalationController(AgentDbContext db, ILogger<EscalationController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ── Dapr Subscriber ────────────────────────────────────────────────────────

    /// <summary>
    /// Receives escalation.required Dapr events and persists them to the clinician queue.
    /// Idempotent: a second event for the same workflow is silently discarded.
    /// </summary>
    [Topic("pubsub", "escalation.required")]
    [HttpPost("/dapr/sub/agents-escalation-required")]
    public async Task<IActionResult> HandleEscalationRequired(
        [FromBody] EscalationRequiredEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Received escalation.required for workflow {WorkflowId} level {Level}",
            payload.WorkflowId, payload.Level);

        // Idempotency guard
        var exists = await _db.EscalationQueue
            .AnyAsync(e => e.WorkflowId == payload.WorkflowId, ct);

        if (exists)
        {
            _logger.LogDebug("Escalation queue item for workflow {WorkflowId} already exists", payload.WorkflowId);
            return Ok(new { skipped = true });
        }

        if (!Enum.TryParse<TriageLevel>(payload.Level, out var level))
            level = TriageLevel.P1_Immediate;

        var item = EscalationQueueItem.Create(payload.WorkflowId, payload.SessionId ?? string.Empty, level);
        _db.EscalationQueue.Add(item);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Escalation queue item {ItemId} created for workflow {WorkflowId}",
            item.Id, payload.WorkflowId);

        return Ok(new { itemId = item.Id });
    }

    // ── REST Endpoints for Clinician UI ───────────────────────────────────────

    /// <summary>Returns open escalation items ordered by severity (P1 first) then age.</summary>
    [HttpGet("/api/v1/agents/escalations")]
    public async Task<IActionResult> GetEscalations(
        [FromQuery] string? status,
        CancellationToken ct)
    {
        var query = _db.EscalationQueue.AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<EscalationStatus>(status, true, out var s))
            query = query.Where(e => e.Status == s);
        else
            query = query.Where(e => e.Status == EscalationStatus.Open || e.Status == EscalationStatus.Claimed);

        var items = await query
            .OrderBy(e => e.Level)
            .ThenBy(e => e.CreatedAt)
            .Take(100)
            .Select(e => new
            {
                e.Id,
                e.WorkflowId,
                e.SessionId,
                Level = e.Level.ToString(),
                Status = e.Status.ToString(),
                e.ClaimedBy,
                e.ClaimedAt,
                e.CreatedAt
            })
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>Clinician claims an open escalation item.</summary>
    [HttpPost("/api/v1/agents/escalations/{id:guid}/claim")]
    public async Task<IActionResult> ClaimEscalation(
        Guid id,
        [FromBody] ClaimEscalationRequest request,
        CancellationToken ct)
    {
        var item = await _db.EscalationQueue.FindAsync([id], ct);
        if (item is null) return NotFound();

        try { item.Claim(request.ClinicianId); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }

        await _db.SaveChangesAsync(ct);
        return Ok(new { item.Id, Status = item.Status.ToString(), item.ClaimedBy, item.ClaimedAt });
    }

    /// <summary>Clinician resolves an escalation item after taking action.</summary>
    [HttpPost("/api/v1/agents/escalations/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveEscalation(
        Guid id,
        [FromBody] ResolveEscalationRequest request,
        CancellationToken ct)
    {
        var item = await _db.EscalationQueue.FindAsync([id], ct);
        if (item is null) return NotFound();

        try { item.Resolve(request.Note); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }

        await _db.SaveChangesAsync(ct);
        return Ok(new { item.Id, Status = item.Status.ToString(), item.ResolvedAt });
    }

    /// <summary>Clinician dismisses an escalation (e.g., duplicate or test case).</summary>
    [HttpPost("/api/v1/agents/escalations/{id:guid}/dismiss")]
    public async Task<IActionResult> DismissEscalation(
        Guid id,
        [FromBody] ResolveEscalationRequest request,
        CancellationToken ct)
    {
        var item = await _db.EscalationQueue.FindAsync([id], ct);
        if (item is null) return NotFound();

        try { item.Dismiss(request.Note); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }

        await _db.SaveChangesAsync(ct);
        return Ok(new { item.Id, Status = item.Status.ToString(), item.ResolvedAt });
    }
}

public record EscalationRequiredEvent(Guid WorkflowId, string? SessionId, string? Level);
public record ClaimEscalationRequest(string ClinicianId);
public record ResolveEscalationRequest(string Note);
