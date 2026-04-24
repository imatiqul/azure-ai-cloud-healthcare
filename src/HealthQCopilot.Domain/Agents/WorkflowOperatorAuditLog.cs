using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Agents;

/// <summary>
/// Immutable audit entry written by the operator write-action endpoints.
/// Records who did what to which workflow and when.
/// </summary>
public class WorkflowOperatorAuditLog : Entity<Guid>
{
    public Guid WorkflowId { get; private set; }

    /// <summary>Identity of the operator (userId / username) performing the action.</summary>
    public string Actor { get; private set; } = string.Empty;

    /// <summary>
    /// Action label that matches the WebPubSub broadcast action names:
    /// Approved | EscalationClaimed | EscalationReleased | Retry:{step} | RequeueScheduling
    /// </summary>
    public string Action { get; private set; } = string.Empty;

    /// <summary>Optional free-text note the operator attached to the action.</summary>
    public string? Note { get; private set; }

    public DateTime Timestamp { get; private set; }

    private WorkflowOperatorAuditLog() { }

    public static WorkflowOperatorAuditLog Create(
        Guid workflowId,
        string actor,
        string action,
        string? note = null)
        => new()
        {
            Id = Guid.NewGuid(),
            WorkflowId = workflowId,
            Actor = actor,
            Action = action,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            Timestamp = DateTime.UtcNow,
        };
}
