using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Ocr.Events;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Ocr.EventHandlers;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Ocr;

public class DocumentProcessedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<DocumentProcessedHandler> _logger =
        Substitute.For<ILogger<DocumentProcessedHandler>>();

    [Fact]
    public async Task Handle_PublishesDocumentProcessedTopic()
    {
        var handler = new DocumentProcessedHandler(_dapr, _logger);
        var evt = new DocumentProcessed(Guid.NewGuid(), "patient-001", "doc-ref-abc");

        await handler.Handle(new DomainEventNotification<DocumentProcessed>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "document.processed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_NullPatientId_PublishesWithoutError()
    {
        // PatientId is nullable — must not throw when absent
        var handler = new DocumentProcessedHandler(_dapr, _logger);
        var evt = new DocumentProcessed(Guid.NewGuid(), null, "doc-ref-xyz");

        await handler.Handle(new DomainEventNotification<DocumentProcessed>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "document.processed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
