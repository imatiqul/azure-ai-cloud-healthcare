using Dapr.Client;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.PopulationHealth.EventHandlers;

/// <summary>
/// Handles PatientRiskAssessed domain event.
///
/// When the population health model assigns a new risk level to a patient:
///   1. Publishes to Dapr topic "patient-risk.assessed" so:
///      - Clinical AI Service updates its context for next triage session
///      - Notification Service can trigger high-risk outreach campaigns
///      - Population Health dashboard updates the risk map in real time
///   2. Logs at Warning severity for High/Critical risk (clinical response required).
/// </summary>
public sealed class PatientRiskAssessedHandler(
    DaprClient dapr,
    ILogger<PatientRiskAssessedHandler> logger)
    : INotificationHandler<DomainEventNotification<PatientRiskAssessed>>
{
    public async Task Handle(
        DomainEventNotification<PatientRiskAssessed> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "patient-risk.assessed",
            data: new
            {
                RiskId = evt.RiskId,
                PatientId = evt.PatientId,
                Level = evt.Level.ToString(),
                RiskScore = evt.RiskScore,
                ModelVersion = evt.ModelVersion,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        if (evt.Level is RiskLevel.High or RiskLevel.Critical)
        {
            logger.LogWarning(
                "PopHealth: HIGH RISK patient {PatientId} assessed — Level={Level} Score={Score:F3} Model={Model}",
                evt.PatientId, evt.Level, evt.RiskScore, evt.ModelVersion);
        }
        else
        {
            logger.LogInformation(
                "PopHealth: Patient {PatientId} risk assessed — Level={Level} Score={Score:F3}",
                evt.PatientId, evt.Level, evt.RiskScore);
        }
    }
}
