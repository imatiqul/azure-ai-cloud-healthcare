namespace HealthQCopilot.Domain.Notifications;

/// <summary>
/// Persists a Dapr dead-letter message for operator review and potential replay.
/// Created when a pubsub message exhausts all delivery retries (maxDeliveryCount = 5).
/// </summary>
public class DeadLetterEvent
{
    public Guid Id { get; private set; }
    /// <summary>Original Dapr topic the message was published to.</summary>
    public string OriginalTopic { get; private set; } = string.Empty;
    /// <summary>Raw JSON payload of the failed message.</summary>
    public string Payload { get; private set; } = string.Empty;
    /// <summary>UTC timestamp when the dead-letter event was received.</summary>
    public DateTime ReceivedAt { get; private set; }
    /// <summary>Whether an operator has acknowledged / resolved this entry.</summary>
    public bool IsResolved { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    private DeadLetterEvent() { }

    public static DeadLetterEvent Create(string originalTopic, string payload) =>
        new()
        {
            Id = Guid.NewGuid(),
            OriginalTopic = originalTopic,
            Payload = payload,
            ReceivedAt = DateTime.UtcNow,
            IsResolved = false
        };

    public void Resolve()
    {
        IsResolved = true;
        ResolvedAt = DateTime.UtcNow;
    }
}
