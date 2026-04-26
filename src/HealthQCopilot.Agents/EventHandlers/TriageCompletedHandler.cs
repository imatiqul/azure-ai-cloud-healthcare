using Dapr.Client;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents.Events;
using HealthQCopilot.Domain.Primitives;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.EventHandlers;

/// <summary>
/// Handles the TriageCompleted domain event raised when the AI Agent assigns a
/// triage level and determines no escalation is required.
///
/// Responsibilities (in-process, post-commit):
///   1. Publish to Dapr pub/sub topic "triage.completed" so Voice MFE and
///      Scheduling Service are immediately notified.
///   2. Trigger WorkflowDispatcher to initiate cross-service dispatch
///      (revenue coding, FHIR encounter, auto-scheduling).
/// </summary>
public sealed class TriageCompletedHandler(
    DaprClient dapr,
    IWorkflowDispatcher dispatcher,
    IServiceScopeFactory scopeFactory,
    ILogger<TriageCompletedHandler> logger)
    : INotificationHandler<DomainEventNotification<TriageCompleted>>
{
    public async Task Handle(
        DomainEventNotification<TriageCompleted> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        // 1. Publish integration event so frontend MFEs + other services react
        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "triage.completed",
            data: new
            {
                WorkflowId = evt.WorkflowId,
                SessionId = evt.SessionId,
                Level = evt.Level.ToString(),
                Reasoning = evt.Reasoning,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        // 2. Load workflow + patient and trigger cross-service dispatch
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AgentDbContext>();
            var workflow = await db.TriageWorkflows
                .FirstOrDefaultAsync(w => w.Id == evt.WorkflowId, ct);

            if (workflow is null)
            {
                logger.LogWarning(
                    "TriageCompletedHandler: Workflow {WorkflowId} not found — skipping dispatch",
                    evt.WorkflowId);
                return;
            }

            await dispatcher.DispatchAsync(workflow, workflow.PatientId, ct);

            logger.LogInformation(
                "TriageCompleted dispatched: WorkflowId={WorkflowId} Level={Level}",
                evt.WorkflowId, evt.Level);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "TriageCompletedHandler: Dispatch failed for WorkflowId={WorkflowId}",
                evt.WorkflowId);
        }
    }
}
