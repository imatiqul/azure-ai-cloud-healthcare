using Dapr.Client;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Identity.EventHandlers;

/// <summary>
/// Handles break-glass access events — both grant and revoke.
/// Break-glass access to PHI is a HIPAA-critical audit event that must be
/// recorded immediately and supervisors must be notified within seconds.
///
/// Responsibilities:
///   1. Publish to Dapr pub/sub topic "breakglass.granted" / "breakglass.revoked"
///      so the Notification Service can immediately alert the compliance team.
///   2. Emit a CRITICAL structured log entry visible in the HIPAA audit trail.
/// </summary>
public sealed class BreakGlassAccessGrantedHandler(
    DaprClient dapr,
    ILogger<BreakGlassAccessGrantedHandler> logger)
    : INotificationHandler<DomainEventNotification<BreakGlassAccessGranted>>
{
    public async Task Handle(
        DomainEventNotification<BreakGlassAccessGranted> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "breakglass.granted",
            data: new
            {
                AccessId = evt.AccessId,
                RequestedByUserId = evt.RequestedByUserId,
                TargetPatientId = evt.TargetPatientId,
                ClinicalJustification = evt.ClinicalJustification,
                ExpiresAt = evt.ExpiresAt,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        // HIPAA Audit — critical severity, always logged regardless of log level
        logger.LogCritical(
            "HIPAA BREAK-GLASS: AccessId={AccessId} RequestedBy={UserId} Patient={PatientId} ExpiresAt={ExpiresAt}",
            evt.AccessId, evt.RequestedByUserId, evt.TargetPatientId, evt.ExpiresAt);
    }
}

/// <summary>
/// Handles break-glass access revocation — supervisor override of an active emergency session.
/// </summary>
public sealed class BreakGlassAccessRevokedHandler(
    DaprClient dapr,
    ILogger<BreakGlassAccessRevokedHandler> logger)
    : INotificationHandler<DomainEventNotification<BreakGlassAccessRevoked>>
{
    public async Task Handle(
        DomainEventNotification<BreakGlassAccessRevoked> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "breakglass.revoked",
            data: new
            {
                AccessId = evt.AccessId,
                RequestedByUserId = evt.RequestedByUserId,
                TargetPatientId = evt.TargetPatientId,
                RevokedByUserId = evt.RevokedByUserId,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogWarning(
            "HIPAA BREAK-GLASS REVOKED: AccessId={AccessId} RevokedBy={RevokedBy} OriginalUser={UserId} Patient={PatientId}",
            evt.AccessId, evt.RevokedByUserId, evt.RequestedByUserId, evt.TargetPatientId);
    }
}
