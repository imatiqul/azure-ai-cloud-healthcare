using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.Voice.Services;

namespace HealthQCopilot.Voice.Hubs;

/// <summary>
/// Handles Azure Web PubSub negotiate requests, returning a time-limited
/// client access URI scoped to the given voice session group.
/// All server→client push (transcript chunks, AI thinking tokens, agent responses)
/// flows through <see cref="IWebPubSubService"/> called by the individual services.
/// </summary>
public static class VoiceWebPubSubEndpoints
{
    public static IEndpointRouteBuilder MapVoiceWebPubSubNegotiate(this IEndpointRouteBuilder app)
    {
        // GET /api/webpubsub/negotiate?sessionId=...&userId=...
        app.MapGet("/api/webpubsub/negotiate", async (
            string? sessionId,
            string? userId,
            IWebPubSubService pubSub,
            ILogger<Program> logger,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(sessionId))
                return Results.BadRequest(new { error = "sessionId is required" });

            var uid = userId ?? "anonymous";
            try
            {
                var url = await pubSub.GetClientAccessUriAsync(sessionId, uid, ct);
                logger.LogInformation(
                    "Web PubSub token issued for session {SessionId} user {UserId}", sessionId, uid);
                return Results.Ok(new { url, sessionId, userId = uid });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to negotiate Web PubSub for session {SessionId}", sessionId);
                return Results.Problem("Web PubSub negotiation failed", statusCode: 503);
            }
        })
        .WithTags("Voice")
        .WithName("NegotiateWebPubSub")
        .RequireAuthorization();

        return app;
    }
}

