using Dapr.Client;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Identity.EventHandlers;

/// <summary>
/// Handles ConsentGranted domain event.
///
/// Patient consent is a HIPAA §164.508 and GDPR Art. 7 requirement.
/// Granting consent must be immediately reflected in downstream systems
/// (FHIR Consent resource, audit logs, data access gateway).
///
/// Publishes to Dapr topic "consent.granted" so:
///   - FHIR Service creates/updates the FHIR R4 Consent resource
///   - API Gateway updates its policy cache to allow the consented scope
/// </summary>
public sealed class ConsentGrantedHandler(
    DaprClient dapr,
    ILogger<ConsentGrantedHandler> logger)
    : INotificationHandler<DomainEventNotification<ConsentGranted>>
{
    public async Task Handle(
        DomainEventNotification<ConsentGranted> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "consent.granted",
            data: new
            {
                ConsentId = evt.ConsentId,
                PatientUserId = evt.PatientUserId,
                Purpose = evt.Purpose,
                Scope = evt.Scope,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "HIPAA Consent: Granted — ConsentId={ConsentId} Patient={PatientUserId} Purpose={Purpose} Scope={Scope}",
            evt.ConsentId, evt.PatientUserId, evt.Purpose, evt.Scope);
    }
}

/// <summary>
/// Handles ConsentRevoked domain event.
///
/// Revocation requires immediate cascade: the FHIR Consent resource must be
/// deactivated, the gateway policy cache cleared, and any in-flight data
/// sharing for this patient/purpose must be halted.
///
/// Logged at Warning severity for HIPAA audit trail visibility.
/// </summary>
public sealed class ConsentRevokedHandler(
    DaprClient dapr,
    ILogger<ConsentRevokedHandler> logger)
    : INotificationHandler<DomainEventNotification<ConsentRevoked>>
{
    public async Task Handle(
        DomainEventNotification<ConsentRevoked> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "consent.revoked",
            data: new
            {
                ConsentId = evt.ConsentId,
                PatientUserId = evt.PatientUserId,
                Purpose = evt.Purpose,
                Reason = evt.Reason,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogWarning(
            "HIPAA Consent: REVOKED — ConsentId={ConsentId} Patient={PatientUserId} Purpose={Purpose} Reason={Reason}",
            evt.ConsentId, evt.PatientUserId, evt.Purpose, evt.Reason);
    }
}
