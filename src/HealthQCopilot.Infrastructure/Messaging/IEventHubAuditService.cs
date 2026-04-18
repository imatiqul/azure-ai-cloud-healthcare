namespace HealthQCopilot.Infrastructure.Messaging;

/// <summary>
/// Publishes structured audit events to Azure Event Hubs for HIPAA-compliant,
/// immutable, time-ordered audit trail.
/// </summary>
public interface IEventHubAuditService
{
    /// <summary>
    /// Publishes an audit event. Fire-and-forget friendly — never throws.
    /// </summary>
    Task PublishAsync(AuditEvent evt, CancellationToken ct = default);
}
