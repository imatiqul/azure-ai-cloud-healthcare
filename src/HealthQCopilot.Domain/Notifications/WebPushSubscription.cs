using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Notifications;

/// <summary>
/// Stores a patient's Web Push API subscription token (RFC 8030).
/// The endpoint + p256dh + auth triplet is sufficient to deliver push notifications
/// without knowing the patient's email/phone — critical for HIPAA-compliant
/// asynchronous delivery to the patient portal.
/// </summary>
public class WebPushSubscription : Entity<Guid>
{
    public string PatientId { get; private set; } = string.Empty;
    /// <summary>Push service endpoint URL (FCM, APNS, Mozilla, etc.)</summary>
    public string Endpoint { get; private set; } = string.Empty;
    /// <summary>ECDH public key, base64url-encoded (for payload encryption).</summary>
    public string P256dh { get; private set; } = string.Empty;
    /// <summary>HMAC authentication secret, base64url-encoded.</summary>
    public string Auth { get; private set; } = string.Empty;
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; }
    public DateTime? DeactivatedAt { get; private set; }

    private WebPushSubscription() { }

    public static WebPushSubscription Create(string patientId, string endpoint, string p256dh, string auth)
    {
        return new WebPushSubscription
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            Endpoint = endpoint,
            P256dh = p256dh,
            Auth = auth,
            CreatedAt = DateTime.UtcNow
        };
    }

    public void Deactivate()
    {
        IsActive = false;
        DeactivatedAt = DateTime.UtcNow;
    }
}
