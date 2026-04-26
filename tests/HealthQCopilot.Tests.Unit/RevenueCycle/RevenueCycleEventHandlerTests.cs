using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.RevenueCycle.EventHandlers;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.RevenueCycle;

// ── CodingJob ─────────────────────────────────────────────────────────────────

public class CodingJobSubmittedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<CodingJobSubmittedHandler> _logger =
        Substitute.For<ILogger<CodingJobSubmittedHandler>>();

    [Fact]
    public async Task Handle_PublishesCodingJobSubmittedTopic()
    {
        var handler = new CodingJobSubmittedHandler(_dapr, _logger);
        var evt = new CodingJobSubmitted(Guid.NewGuid(), ["Z87.891", "J44.1"]);
        var notification = new DomainEventNotification<CodingJobSubmitted>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "coding-job.submitted",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── PriorAuth ─────────────────────────────────────────────────────────────────

public class PriorAuthApprovedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<PriorAuthApprovedHandler> _logger =
        Substitute.For<ILogger<PriorAuthApprovedHandler>>();

    [Fact]
    public async Task Handle_PublishesPriorAuthResultApproved()
    {
        var handler = new PriorAuthApprovedHandler(_dapr, _logger);
        var evt = new PriorAuthApproved(Guid.NewGuid(), "patient-001");
        var notification = new DomainEventNotification<PriorAuthApproved>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "priorauth.result",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class PriorAuthDeniedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<PriorAuthDeniedHandler> _logger =
        Substitute.For<ILogger<PriorAuthDeniedHandler>>();

    [Fact]
    public async Task Handle_PublishesPriorAuthResultDenied()
    {
        var handler = new PriorAuthDeniedHandler(_dapr, _logger);
        var evt = new PriorAuthDenied(Guid.NewGuid(), "patient-002", "Not medically necessary");
        var notification = new DomainEventNotification<PriorAuthDenied>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "priorauth.result",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_BothApprovedAndDenied_PublishToSameTopic()
    {
        // Ensures downstream subscribers use a single topic with Outcome discriminator
        var approvedHandler = new PriorAuthApprovedHandler(_dapr, Substitute.For<ILogger<PriorAuthApprovedHandler>>());
        var deniedHandler = new PriorAuthDeniedHandler(_dapr, Substitute.For<ILogger<PriorAuthDeniedHandler>>());

        await approvedHandler.Handle(
            new DomainEventNotification<PriorAuthApproved>(new PriorAuthApproved(Guid.NewGuid(), "p1")),
            CancellationToken.None);
        await deniedHandler.Handle(
            new DomainEventNotification<PriorAuthDenied>(new PriorAuthDenied(Guid.NewGuid(), "p2", "Experimental")),
            CancellationToken.None);

        await _dapr.Received(2).PublishEventAsync(
            "pubsub", "priorauth.result",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── Claims ───────────────────────────────────────────────────────────────────

public class ClaimSubmittedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<ClaimSubmittedHandler> _logger =
        Substitute.For<ILogger<ClaimSubmittedHandler>>();

    [Fact]
    public async Task Handle_PublishesClaimSubmittedTopic()
    {
        var handler = new ClaimSubmittedHandler(_dapr, _logger);
        var evt = new ClaimSubmitted(Guid.NewGuid(), "patient-003", "BlueCross");
        var notification = new DomainEventNotification<ClaimSubmitted>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "claim.submitted",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class ClaimRejectedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<ClaimRejectedHandler> _logger =
        Substitute.For<ILogger<ClaimRejectedHandler>>();

    [Fact]
    public async Task Handle_PublishesClaimRejectedTopic()
    {
        var handler = new ClaimRejectedHandler(_dapr, _logger);
        var evt = new ClaimRejected(Guid.NewGuid(), "Invalid NPI — provider not enrolled");
        var notification = new DomainEventNotification<ClaimRejected>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "claim.rejected",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── Remittance ────────────────────────────────────────────────────────────────

public class RemittanceReceivedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<RemittanceReceivedHandler> _logger =
        Substitute.For<ILogger<RemittanceReceivedHandler>>();

    [Fact]
    public async Task Handle_PublishesRemittanceReceivedTopic()
    {
        var handler = new RemittanceReceivedHandler(_dapr, _logger);
        var evt = new RemittanceReceived(Guid.NewGuid(), "Aetna", 150_00L);
        var notification = new DomainEventNotification<RemittanceReceived>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "remittance.received",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class RemittancePostedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<RemittancePostedHandler> _logger =
        Substitute.For<ILogger<RemittancePostedHandler>>();

    [Fact]
    public async Task Handle_PublishesRemittancePostedTopic()
    {
        var handler = new RemittancePostedHandler(_dapr, _logger);
        var evt = new RemittancePosted(Guid.NewGuid(), 150_00L);
        var notification = new DomainEventNotification<RemittancePosted>(evt);

        await handler.Handle(notification, CancellationToken.None);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "remittance.posted",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
