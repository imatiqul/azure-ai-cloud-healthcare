namespace HealthQCopilot.Domain.Agents;

public class GuideConversation
{
    public Guid Id { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime LastMessageAt { get; private set; }
    public List<GuideMessage> Messages { get; private set; } = [];

    private GuideConversation() { }

    public static GuideConversation Create(Guid id)
    {
        return new GuideConversation
        {
            Id = id,
            CreatedAt = DateTime.UtcNow,
            LastMessageAt = DateTime.UtcNow
        };
    }

    public void AddMessage(string role, string content)
    {
        Messages.Add(new GuideMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = Id,
            Role = role,
            Content = content,
            Timestamp = DateTime.UtcNow
        });
        LastMessageAt = DateTime.UtcNow;
    }
}

public class GuideMessage
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}
