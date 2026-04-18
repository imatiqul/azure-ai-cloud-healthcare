using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Agents;

public enum EscalationStatus
{
    Open,
    Claimed,
    Resolved,
    Dismissed
}

/// <summary>
/// Persistent clinician-facing escalation item created when a P1/P2 triage workflow
/// requires immediate human review.
/// </summary>
public class EscalationQueueItem : AggregateRoot<Guid>
{
    public Guid WorkflowId { get; private set; }
    public string SessionId { get; private set; } = string.Empty;
    public TriageLevel Level { get; private set; }
    public EscalationStatus Status { get; private set; } = EscalationStatus.Open;
    public string? ClaimedBy { get; private set; }
    public DateTime? ClaimedAt { get; private set; }
    public string? ResolutionNote { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    private EscalationQueueItem() { }

    public static EscalationQueueItem Create(Guid workflowId, string sessionId, TriageLevel level)
    {
        return new EscalationQueueItem
        {
            Id = Guid.NewGuid(),
            WorkflowId = workflowId,
            SessionId = sessionId,
            Level = level,
            Status = EscalationStatus.Open,
            CreatedAt = DateTime.UtcNow
        };
    }

    public void Claim(string clinicianId)
    {
        if (Status != EscalationStatus.Open)
            throw new InvalidOperationException("Only open escalations can be claimed.");
        Status = EscalationStatus.Claimed;
        ClaimedBy = clinicianId;
        ClaimedAt = DateTime.UtcNow;
    }

    public void Resolve(string note)
    {
        if (Status == EscalationStatus.Resolved)
            throw new InvalidOperationException("Escalation is already resolved.");
        Status = EscalationStatus.Resolved;
        ResolutionNote = note;
        ResolvedAt = DateTime.UtcNow;
    }

    public void Dismiss(string note)
    {
        if (Status == EscalationStatus.Dismissed)
            throw new InvalidOperationException("Escalation is already dismissed.");
        Status = EscalationStatus.Dismissed;
        ResolutionNote = note;
        ResolvedAt = DateTime.UtcNow;
    }
}
