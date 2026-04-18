using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Notifications;

public enum MessageChannel { Sms, Voice, Email, Push }
public enum MessageStatus { Pending, Sent, Delivered, Failed }

public class Message : Entity<Guid>
{
    public Guid CampaignId { get; private set; }
    public string PatientId { get; private set; } = string.Empty;
    public MessageChannel Channel { get; private set; }
    public string Content { get; private set; } = string.Empty;
    public MessageStatus Status { get; private set; } = MessageStatus.Pending;
    /// <summary>Resolved recipient address: email address for Email channel, phone number for SMS.</summary>
    public string? RecipientAddress { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? SentAt { get; private set; }

    private Message() { }

    public static Message Create(Guid campaignId, string patientId, MessageChannel channel, string content,
        string? recipientAddress = null)
    {
        return new Message
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            PatientId = patientId,
            Channel = channel,
            Content = content,
            RecipientAddress = recipientAddress,
            CreatedAt = DateTime.UtcNow
        };
    }

    public void MarkSent() { Status = MessageStatus.Sent; SentAt = DateTime.UtcNow; }
    public void MarkDelivered() => Status = MessageStatus.Delivered;
    public void MarkFailed() => Status = MessageStatus.Failed;
}
