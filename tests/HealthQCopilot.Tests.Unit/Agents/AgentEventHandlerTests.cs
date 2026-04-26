using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Agents.EventHandlers;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Domain.Agents.Events;
using HealthQCopilot.Domain.Primitives;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

public class EscalationRequiredHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<EscalationRequiredHandler> _logger =
        Substitute.For<ILogger<EscalationRequiredHandler>>();

    [Fact]
    public async Task Handle_PublishesEscalationTopic()
    {
        var handler = new EscalationRequiredHandler(_dapr, _logger);
        var evt = new EscalationRequired(Guid.NewGuid(), "session-001", TriageLevel.P1_Immediate);
        var notification = new DomainEventNotification<EscalationRequired>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub",
            "escalation.required",
            Arg.Any<object>(),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(TriageLevel.P1_Immediate)]
    [InlineData(TriageLevel.P2_Urgent)]
    public async Task Handle_AnyEscalationLevel_AlwaysPublishes(TriageLevel level)
    {
        var handler = new EscalationRequiredHandler(_dapr, _logger);
        var evt = new EscalationRequired(Guid.NewGuid(), "session-x", level);
        var notification = new DomainEventNotification<EscalationRequired>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "escalation.required",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class TriageCompletedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<TriageCompletedHandler> _logger =
        Substitute.For<ILogger<TriageCompletedHandler>>();

    [Fact]
    public async Task Handle_PublishesTriageCompletedTopic()
    {
        // Arrange
        var dispatcher = Substitute.For<IWorkflowDispatcher>();

        var scopeFactory = Substitute.For<IServiceScopeFactory>();
        var scope = Substitute.For<IServiceScope>();
        var sp = Substitute.For<IServiceProvider>();
        scope.ServiceProvider.Returns(sp);
        scopeFactory.CreateScope().Returns(scope);

        var handler = new TriageCompletedHandler(_dapr, dispatcher, scopeFactory, _logger);
        var evt = new TriageCompleted(Guid.NewGuid(), "session-abc", TriageLevel.P3_Standard, "Stable vitals.");
        var notification = new DomainEventNotification<TriageCompleted>(evt);

        // Act
        await handler.Handle(notification, CancellationToken.None);

        // Assert — Dapr publish always fires regardless of workflow load outcome
        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "triage.completed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
