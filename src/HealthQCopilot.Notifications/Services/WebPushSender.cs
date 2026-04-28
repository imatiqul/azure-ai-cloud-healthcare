using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Notifications.Infrastructure;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace HealthQCopilot.Notifications.Services;

/// <summary>
/// Sends Web Push notifications to subscribers using the Web Push Protocol (RFC 8030).
/// 
/// Implementation notes:
/// - Uses Voluntary Application Server Identification (VAPID) per RFC 8292.
/// - Payload is encrypted with the subscriber's public key (p256dh) so only
///   the browser can decrypt it — HIPAA-appropriate for PHI-adjacent alerts.
/// - The VAPID private key must be stored in Key Vault; a placeholder is used
///   here so the service starts without configuration and degrades gracefully.
/// </summary>
public sealed class WebPushSender
{
    private readonly NotificationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<WebPushSender> _logger;

    public WebPushSender(
        NotificationDbContext db,
        IConfiguration config,
        ILogger<WebPushSender> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Push a notification payload to all active subscriptions for a patient.
    /// Returns number of successfully delivered notifications.
    /// </summary>
    public async Task<int> SendAsync(string patientId, string title, string body, CancellationToken ct = default)
    {
        var subscriptions = await _db.WebPushSubscriptions
            .Where(s => s.PatientId == patientId && s.IsActive)
            .ToListAsync(ct);

        if (subscriptions.Count == 0)
        {
            _logger.LogDebug("No active web-push subscriptions for patient {PatientId}", patientId);
            return 0;
        }

        var vapidSubject = _config["WebPush:VapidSubject"] ?? "mailto:admin@healthq.example";
        var vapidPublicKey = _config["WebPush:VapidPublicKey"];
        var vapidPrivateKey = _config["WebPush:VapidPrivateKey"];

        if (string.IsNullOrEmpty(vapidPublicKey) || string.IsNullOrEmpty(vapidPrivateKey))
        {
            _logger.LogError(
                "VAPID keys not configured — web-push notifications cannot be delivered for patient {PatientId}. " +
                "Set WebPush:VapidPublicKey and WebPush:VapidPrivateKey in Key Vault (secret names: " +
                "healthq-vapid-public-key, healthq-vapid-private-key). " +
                "This is a critical configuration gap; no push notifications will be sent until resolved.",
                patientId);
            return 0;
        }

        var payload = System.Text.Json.JsonSerializer.Serialize(new { title, body, timestamp = DateTime.UtcNow });
        var delivered = 0;

        foreach (var sub in subscriptions)
        {
            try
            {
                await DeliverAsync(sub, payload, vapidSubject, vapidPublicKey, vapidPrivateKey, ct);
                delivered++;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                _logger.LogWarning(ex,
                    "Web push delivery failed for patient {PatientId} endpoint {Endpoint}",
                    patientId, sub.Endpoint);
                // If the push service returns 410 Gone, the subscription is expired
                if (ex.Message.Contains("410"))
                {
                    sub.Deactivate();
                    await _db.SaveChangesAsync(ct);
                }
            }
        }

        return delivered;
    }

    // ── Low-level RFC 8030 + RFC 8292 VAPID push delivery ────────────────────
    private async Task DeliverAsync(
        WebPushSubscription sub,
        string payloadJson,
        string vapidSubject,
        string vapidPublicKey,
        string vapidPrivateKey,
        CancellationToken ct)
    {
        var pushClient = new WebPushClient();
        var vapidDetails = new VapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        var subscription = new PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth);

        try
        {
            await pushClient.SendNotificationAsync(subscription, payloadJson, vapidDetails);
        }
        catch (WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
        {
            // Subscription expired — mark inactive so we stop sending to it
            sub.Deactivate();
            await _db.SaveChangesAsync(ct);
            throw new HttpRequestException("410");
        }
    }
}
