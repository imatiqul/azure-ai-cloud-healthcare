using Dapr.Client;
using HealthQCopilot.Domain.Agents.Events;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Agents.EventHandlers;

/// <summary>
/// Handles the EscalationRequired domain event raised when the AI Agent detects
/// a P1 or P2 triage level that requires immediate human-in-the-loop review.
///
/// Responsibilities (in-process, post-commit):
///   1. Publish to Dapr pub/sub topic "escalation.required" so:
///      - The real-time hub (SignalR) can push an alert to the clinician dashboard.
///      - The Notification Service sends an urgent SMS/call to the on-call team.
///   2. Log a structured audit entry (visible in App Insights / HIPAA audit trail).
/// </summary>
public sealed class EscalationRequiredHandler(
    DaprClient dapr,
    ILogger<EscalationRequiredHandler> logger)
    : INotificationHandler<DomainEventNotification<EscalationRequired>>
{
    public async Task Handle(
        DomainEventNotification<EscalationRequired> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        // Publish escalation event — Notification Service and real-time hub consume this
        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "escalation.required",
            data: new
            {
                WorkflowId = evt.WorkflowId,
                SessionId = evt.SessionId,
                Level = evt.Level.ToString(),
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        // HIPAA-relevant structured log — escalations are always audit-logged
        logger.LogWarning(
            "ESCALATION REQUIRED: WorkflowId={WorkflowId} SessionId={SessionId} Level={Level} OccurredAt={OccurredAt}",
            evt.WorkflowId, evt.SessionId, evt.Level, evt.OccurredAt);
    }
}
