namespace HealthQCopilot.Infrastructure.RealTime;

/// <summary>
/// Real-time server-to-client push service backed by Azure Web PubSub.
/// Used by all microservices to push events to connected frontend clients.
/// </summary>
public interface IWebPubSubService
{
    /// <summary>Sends a typed message to all clients joined to the given voice session group.</summary>
    Task SendToSessionAsync(string sessionId, object message, CancellationToken ct = default);

    /// <summary>Sends an AI thinking token (streaming) to the session's frontend.</summary>
    Task SendAiThinkingAsync(string sessionId, string token, bool isFinal = false, CancellationToken ct = default);

    /// <summary>Sends the final triage agent response to the session's frontend.</summary>
    Task SendAgentResponseAsync(string sessionId, string text, string? triageLevel, bool guardApproved, CancellationToken ct = default);

    /// <summary>Sends a live transcript chunk to the session's frontend.</summary>
    Task SendTranscriptChunkAsync(string sessionId, string text, CancellationToken ct = default);

    /// <summary>(W5.2) Notifies the session that an agent tool/function is being invoked.</summary>
    Task SendToolInvokedAsync(string sessionId, string agentName, string pluginName, string functionName, CancellationToken ct = default);

    /// <summary>(W5.2) Notifies the session that an agent tool/function has completed.</summary>
    Task SendToolCompletedAsync(string sessionId, string pluginName, string functionName, double durationMs, bool success, CancellationToken ct = default);

    /// <summary>
    /// Generates a client access URL for the specified session.
    /// The URL embeds a time-limited JWT allowing the client to join the session group.
    /// </summary>
    Task<string> GetClientAccessUriAsync(string sessionId, string userId, CancellationToken ct = default);

    // ── Workflow Ops real-time push ──────────────────────────────────────────

    /// <summary>Broadcasts a workflow state-change event to all connected workbench supervisors.</summary>
    Task SendWorkflowUpdateAsync(object workflowUpdate, CancellationToken ct = default);

    /// <summary>
    /// Generates a client access URL scoped to the workflow-ops group.
    /// </summary>
    Task<string> GetWorkflowOpsClientAccessUriAsync(string userId, CancellationToken ct = default);
}
