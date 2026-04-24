using System.Text.Json;
using Azure;
using Azure.Core;
using Azure.Messaging.WebPubSub;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.RealTime;

/// <summary>
/// Azure Web PubSub implementation of <see cref="IWebPubSubService"/>.
/// Uses the service-side REST API to push messages to connected frontend clients
/// organised into session-scoped groups.
/// Falls back to a no-op when Web PubSub is not configured (local dev / test).
/// </summary>
public sealed class WebPubSubService : IWebPubSubService
{
    private readonly WebPubSubServiceClient? _client;
    private readonly ILogger<WebPubSubService> _logger;

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public WebPubSubService(IConfiguration config, ILogger<WebPubSubService> logger)
    {
        _logger = logger;

        var connectionString = config["WebPubSub:ConnectionString"];
        var hubName = config["WebPubSub:HubName"] ?? "voice";

        if (!string.IsNullOrEmpty(connectionString))
        {
            _client = new WebPubSubServiceClient(connectionString, hubName);
            _logger.LogInformation("Azure Web PubSub enabled → hub: {HubName}", hubName);
        }
        else
        {
            _logger.LogWarning(
                "WebPubSub:ConnectionString not configured — real-time push disabled (local dev).");
        }
    }

    public async Task SendToSessionAsync(string sessionId, object message, CancellationToken ct = default)
    {
        if (_client is null) return;

        try
        {
            var json = JsonSerializer.Serialize(message, SerializerOptions);
            var groupName = GroupName(sessionId);
            var content = RequestContent.Create(BinaryData.FromString(json));
            var context = ct.CanBeCanceled ? new RequestContext { CancellationToken = ct } : null;
            await _client.SendToGroupAsync(groupName, content, new ContentType("application/json"), excluded: null, context: context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Web PubSub SendToSession failed for session {SessionId}", sessionId);
        }
    }

    public Task SendAiThinkingAsync(string sessionId, string token, bool isFinal = false, CancellationToken ct = default) =>
        SendToSessionAsync(sessionId, new
        {
            type = "AiThinking",
            token,
            isFinal,
            timestamp = DateTimeOffset.UtcNow,
        }, ct);

    public Task SendAgentResponseAsync(string sessionId, string text, string? triageLevel, bool guardApproved, CancellationToken ct = default) =>
        SendToSessionAsync(sessionId, new
        {
            type = "AgentResponse",
            text,
            triageLevel,
            guardApproved,
            timestamp = DateTimeOffset.UtcNow,
        }, ct);

    public Task SendTranscriptChunkAsync(string sessionId, string text, CancellationToken ct = default) =>
        SendToSessionAsync(sessionId, new
        {
            type = "TranscriptReceived",
            text,
            timestamp = DateTimeOffset.UtcNow,
        }, ct);

    public async Task<string> GetClientAccessUriAsync(string sessionId, string userId, CancellationToken ct = default)
    {
        if (_client is null)
        {
            // Return a placeholder URL for local dev; frontend handles graceful degradation
            return $"ws://localhost:4000/client/hubs/voice?session={sessionId}&user={userId}";
        }

        try
        {
            var groupName = GroupName(sessionId);
            var uri = await _client.GetClientAccessUriAsync(
                expiresAfter: TimeSpan.FromHours(2),
                userId: userId,
                roles: new[]
                {
                    $"webpubsub.joinLeaveGroup.{groupName}",
                    $"webpubsub.sendToGroup.{groupName}",
                },
                cancellationToken: ct);

            return uri.AbsoluteUri;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate Web PubSub client access URI for session {SessionId}", sessionId);
            throw;
        }
    }

    private static string GroupName(string sessionId) => $"session-{sessionId}";

    private const string WorkflowOpsGroup = "workflow-ops";

    public async Task SendWorkflowUpdateAsync(object workflowUpdate, CancellationToken ct = default)
    {
        if (_client is null) return;

        try
        {
            var json = JsonSerializer.Serialize(workflowUpdate, SerializerOptions);
            var content = RequestContent.Create(BinaryData.FromString(json));
            var context = ct.CanBeCanceled ? new RequestContext { CancellationToken = ct } : null;
            await _client.SendToGroupAsync(WorkflowOpsGroup, content, new ContentType("application/json"), excluded: null, context: context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Web PubSub SendWorkflowUpdate failed");
        }
    }

    public async Task<string> GetWorkflowOpsClientAccessUriAsync(string userId, CancellationToken ct = default)
    {
        if (_client is null)
        {
            return $"ws://localhost:4000/client/hubs/voice?group={WorkflowOpsGroup}&user={userId}";
        }

        try
        {
            var uri = await _client.GetClientAccessUriAsync(
                expiresAfter: TimeSpan.FromHours(8),
                userId: userId,
                roles: new[]
                {
                    $"webpubsub.joinLeaveGroup.{WorkflowOpsGroup}",
                },
                cancellationToken: ct);

            return uri.AbsoluteUri;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate Web PubSub workflow-ops access URI for user {UserId}", userId);
            throw;
        }
    }
}
