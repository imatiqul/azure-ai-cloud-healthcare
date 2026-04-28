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
        string sessionId, string triageLevel, bool guardApproved, string? userId = null,
        string? modelId = null, string? modelVersion = null,
        string? promptId = null, string? promptVersion = null,
        int? redactionEntityCount = null)
    {
        var details = new Dictionary<string, object?>
        {
            ["triageLevel"] = triageLevel,
            ["guardApproved"] = guardApproved,
        };
        if (!string.IsNullOrEmpty(modelId)) details["modelId"] = modelId;
        if (!string.IsNullOrEmpty(modelVersion)) details["modelVersion"] = modelVersion;
        if (!string.IsNullOrEmpty(promptId)) details["promptId"] = promptId;
        if (!string.IsNullOrEmpty(promptVersion)) details["promptVersion"] = promptVersion;
        if (redactionEntityCount is not null) details["redactionEntityCount"] = redactionEntityCount;
        return new("agent_decision", "triage_workflow", "classify_urgency", sessionId, userId,
            DateTimeOffset.UtcNow, Details: details);
    }

    /// <summary>
    /// W1.5 — emitted by <c>WorkflowDispatcher</c> after cross-service dispatch
    /// completes. Links the original AI decision to the downstream services it
    /// triggered (revenue coding, FHIR encounter, scheduling, notifications)
    /// so an auditor can reconstruct the full chain of custody for a triage.
    /// </summary>
    public static AuditEvent WorkflowDispatched(
        string sessionId, Guid workflowId, string triageLevel,
        IReadOnlyCollection<string> dispatchTargets, string? userId = null) =>
        new("workflow_dispatched", "triage_workflow", "dispatch", sessionId, userId,
            DateTimeOffset.UtcNow, Details: new Dictionary<string, object?>
            {
                ["workflowId"] = workflowId,
                ["triageLevel"] = triageLevel,
                ["targets"] = dispatchTargets,
            });

    public static AuditEvent AiThinkingStarted(string sessionId) =>
        new("ai_thinking_started", "triage_workflow", "stream_reasoning", sessionId, null,
            DateTimeOffset.UtcNow);

    /// <summary>
    /// W1.5 — proof-of-redaction audit record. Captures the count + kind of PHI
    /// entities masked before a prompt left the process. We deliberately store
    /// only counts/kinds — never the raw values — so the audit log is itself
    /// HIPAA-safe (45 CFR § 164.312(b)).
    /// </summary>
    public static AuditEvent PhiRedacted(
        string sessionId, string agentName, int entityCount,
        IReadOnlyDictionary<string, int> kindCounts, string? userId = null) =>
        new("phi_redacted", "llm_request", agentName, sessionId, userId,
            DateTimeOffset.UtcNow, Details: new Dictionary<string, object?>
            {
                ["entityCount"] = entityCount,
                ["kinds"] = kindCounts,
            });

    /// <summary>
    /// W1.6b — dedicated factory for patient-consent decisions checked at the
    /// AI-workflow gate (<c>HealthQ:PatientConsentGate</c>). Replaces the
    /// previous overload of <see cref="AgentDecision"/> with a synthetic
    /// <c>triageLevel="consent-denied"</c> string so auditors can filter on a
    /// stable <c>EventType="consent_decision"</c> rather than a magic value
    /// inside the triageLevel field. Captures scope, granted/denied verdict,
    /// the human-readable reason, who granted it, and the granted-at timestamp
    /// — all of which are already returned by <see cref="IConsentService"/>.
    /// PatientId is captured separately from sessionId so a Kusto query can
    /// reconstruct every consent decision for a given patient across sessions
    /// (45 CFR § 164.508 / § 164.524 right-of-access support).
    /// </summary>
    public static AuditEvent ConsentDecision(
        string sessionId, string? patientId, string scope, bool granted,
        string? reason = null, string? grantedBy = null, DateTimeOffset? grantedAt = null,
        string? userId = null)
    {
        var details = new Dictionary<string, object?>
        {
            ["scope"] = scope,
            ["granted"] = granted,
        };
        if (!string.IsNullOrEmpty(patientId)) details["patientId"] = patientId;
        if (!string.IsNullOrEmpty(reason)) details["reason"] = reason;
        if (!string.IsNullOrEmpty(grantedBy)) details["grantedBy"] = grantedBy;
        if (grantedAt is not null) details["grantedAt"] = grantedAt;
        return new("consent_decision", "patient_consent", granted ? "grant" : "deny",
            sessionId, userId, DateTimeOffset.UtcNow, Details: details);
    }
}
