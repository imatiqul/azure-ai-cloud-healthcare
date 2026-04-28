using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Voice.Events;
using HealthQCopilot.Voice.EventHandlers;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Voice;

public class TranscriptProducedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly IDistributedCache _cache = Substitute.For<IDistributedCache>();
    private readonly ILogger<TranscriptProducedHandler> _logger =
        Substitute.For<ILogger<TranscriptProducedHandler>>();

    [Fact]
    public async Task Handle_PublishesToDaprPubSub()
    {
        var handler = new TranscriptProducedHandler(_dapr, _cache, _logger);
        var evt = new TranscriptProduced(Guid.NewGuid(), "Patient reports chest pain.");
        var notification = new DomainEventNotification<TranscriptProduced>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub",
            "transcript.produced",
            Arg.Any<object>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_EvictsCacheForSession()
    {
        var handler = new TranscriptProducedHandler(_dapr, _cache, _logger);
        var sessionId = Guid.NewGuid();
        var evt = new TranscriptProduced(sessionId, "Transcript text.");
        var notification = new DomainEventNotification<TranscriptProduced>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _cache.Received(1).RemoveAsync(
            $"healthq:voice:transcript:{sessionId}",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_CacheFailure_StillPublishesToDapr()
    {
        _cache.RemoveAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
              .Returns(Task.FromException(new Exception("Redis down")));

        var handler = new TranscriptProducedHandler(_dapr, _cache, _logger);
        var evt = new TranscriptProduced(Guid.NewGuid(), "text");
        var notification = new DomainEventNotification<TranscriptProduced>(evt);

        // Should not throw — cache failure is non-fatal
        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "transcript.produced",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class SessionEndedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly IDistributedCache _cache = Substitute.For<IDistributedCache>();
    private readonly ILogger<SessionEndedHandler> _logger =
        Substitute.For<ILogger<SessionEndedHandler>>();

    [Fact]
    public async Task Handle_PublishesToDaprPubSub()
    {
        var handler = new SessionEndedHandler(_dapr, _cache, _logger);
        var evt = new SessionEnded(Guid.NewGuid(), TimeSpan.FromMinutes(12));
        var notification = new DomainEventNotification<SessionEnded>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "session.ended",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_EvoictsSessionAndTranscriptCacheKeys()
    {
        var handler = new SessionEndedHandler(_dapr, _cache, _logger);
        var sessionId = Guid.NewGuid();
        var evt = new SessionEnded(sessionId, TimeSpan.FromMinutes(5));
        var notification = new DomainEventNotification<SessionEnded>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _cache.Received(1).RemoveAsync(
            $"healthq:voice:session:{sessionId}", Arg.Any<CancellationToken>());
        await _cache.Received(1).RemoveAsync(
            $"healthq:voice:transcript:{sessionId}", Arg.Any<CancellationToken>());
    }
}
