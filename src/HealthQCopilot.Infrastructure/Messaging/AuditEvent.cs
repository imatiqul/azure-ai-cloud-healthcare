namespace HealthQCopilot.Infrastructure.Messaging;

/// <summary>
/// Immutable audit event published to Azure Event Hubs for HIPAA-compliant,
/// time-ordered audit trail of all PHI access and AI decisions.
/// </summary>
public sealed record AuditEvent(
    string EventType,
    string Resource,
    string Action,
    string? SessionId,
    string? UserId,
    DateTimeOffset Timestamp,
    int? HttpStatusCode = null,
    long? DurationMs = null,
    string? CorrelationId = null,
    Dictionary<string, object?>? Details = null
)
{
    public static AuditEvent PhiAccess(
        string resource, string action, string? userId, string? sessionId,
        int statusCode, long durationMs, string? correlationId) =>
        new("phi_access", resource, action, sessionId, userId,
            DateTimeOffset.UtcNow, statusCode, durationMs, correlationId);

    public static AuditEvent AgentDecision(
        string sessionId, string triageLevel, bool guardApproved, string? userId = null) =>
        new("agent_decision", "triage_workflow", "classify_urgency", sessionId, userId,
            DateTimeOffset.UtcNow, Details: new Dictionary<string, object?>
            {
                ["triageLevel"] = triageLevel,
                ["guardApproved"] = guardApproved,
            });

    public static AuditEvent AiThinkingStarted(string sessionId) =>
        new("ai_thinking_started", "triage_workflow", "stream_reasoning", sessionId, null,
            DateTimeOffset.UtcNow);
}
