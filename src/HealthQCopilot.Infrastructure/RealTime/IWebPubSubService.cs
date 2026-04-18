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

    /// <summary>
    /// Generates a client access URL for the specified session.
    /// The URL embeds a time-limited JWT allowing the client to join the session group.
    /// </summary>
    Task<string> GetClientAccessUriAsync(string sessionId, string userId, CancellationToken ct = default);
}
