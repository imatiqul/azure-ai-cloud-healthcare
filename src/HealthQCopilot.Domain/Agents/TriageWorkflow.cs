using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Agents.Events;

namespace HealthQCopilot.Domain.Agents;

public enum TriageLevel
{
    P1_Immediate,
    P2_Urgent,
    P3_Standard,
    P4_NonUrgent
}

public enum WorkflowStatus
{
    Pending,
    Processing,
    AwaitingHumanReview,
    Completed,
    Escalated,
    Failed,
    Rejected
}

public class TriageWorkflow : AggregateRoot<Guid>
{
    public string SessionId { get; private set; } = string.Empty;
    public string TranscriptText { get; private set; } = string.Empty;
    public TriageLevel? AssignedLevel { get; private set; }
    public WorkflowStatus Status { get; private set; } = WorkflowStatus.Pending;
    public string? AgentReasoning { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    private TriageWorkflow() { }

    public static TriageWorkflow Create(Guid id, string sessionId, string transcriptText)
    {
        var workflow = new TriageWorkflow
        {
            Id = id,
            SessionId = sessionId,
            TranscriptText = transcriptText,
            Status = WorkflowStatus.Processing,
            CreatedAt = DateTime.UtcNow
        };
        return workflow;
    }

    public void AssignTriage(TriageLevel level, string reasoning)
    {
        AssignedLevel = level;
        AgentReasoning = reasoning;

        if (level == TriageLevel.P1_Immediate)
        {
            Status = WorkflowStatus.AwaitingHumanReview;
            RaiseDomainEvent(new EscalationRequired(Id, SessionId, level));
        }
        else
        {
            Status = WorkflowStatus.Completed;
            CompletedAt = DateTime.UtcNow;
            RaiseDomainEvent(new TriageCompleted(Id, SessionId, level, reasoning));
        }
    }

    public void ApproveEscalation()
    {
        Status = WorkflowStatus.Completed;
        CompletedAt = DateTime.UtcNow;
        RaiseDomainEvent(new TriageCompleted(Id, SessionId, AssignedLevel!.Value, AgentReasoning!));
    }

    public void Escalate()
    {
        if (Status == WorkflowStatus.Escalated) return;
        Status = WorkflowStatus.Escalated;
        RaiseDomainEvent(new EscalationRequired(Id, SessionId, AssignedLevel ?? TriageLevel.P1_Immediate));
    }

    public void Fail(string reason)
    {
        Status = WorkflowStatus.Failed;
        AgentReasoning = reason;
    }

    public void Reject(string reason)
    {
        if (Status != WorkflowStatus.AwaitingHumanReview)
            return;
        Status = WorkflowStatus.Rejected;
        AgentReasoning = $"[REJECTED] {reason}";
    }
}
