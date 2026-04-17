using HealthQCopilot.Domain.Agents;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Domain;

public class GuideConversationTests
{
    [Fact]
    public void Create_ShouldInitializeWithEmptyMessages()
    {
        var id = Guid.NewGuid();
        var conversation = GuideConversation.Create(id);

        Assert.Equal(id, conversation.Id);
        Assert.Empty(conversation.Messages);
        Assert.True(conversation.CreatedAt <= DateTime.UtcNow);
    }

    [Fact]
    public void AddMessage_ShouldAppendToMessages()
    {
        var conversation = GuideConversation.Create(Guid.NewGuid());

        conversation.AddMessage("user", "Hello");
        conversation.AddMessage("assistant", "Hi there!");

        Assert.Equal(2, conversation.Messages.Count);
        Assert.Equal("user", conversation.Messages[0].Role);
        Assert.Equal("Hello", conversation.Messages[0].Content);
        Assert.Equal("assistant", conversation.Messages[1].Role);
        Assert.Equal("Hi there!", conversation.Messages[1].Content);
    }

    [Fact]
    public void AddMessage_ShouldUpdateLastMessageAt()
    {
        var conversation = GuideConversation.Create(Guid.NewGuid());
        var before = conversation.LastMessageAt;

        conversation.AddMessage("user", "Test");

        Assert.True(conversation.LastMessageAt >= before);
    }

    [Fact]
    public void AddMessage_ShouldSetUniqueIds()
    {
        var conversation = GuideConversation.Create(Guid.NewGuid());

        conversation.AddMessage("user", "First");
        conversation.AddMessage("user", "Second");

        Assert.NotEqual(conversation.Messages[0].Id, conversation.Messages[1].Id);
        Assert.NotEqual(Guid.Empty, conversation.Messages[0].Id);
    }

    [Fact]
    public void AddMessage_ShouldSetConversationId()
    {
        var conversation = GuideConversation.Create(Guid.NewGuid());

        conversation.AddMessage("user", "Test");

        Assert.Equal(conversation.Id, conversation.Messages[0].ConversationId);
    }
}
