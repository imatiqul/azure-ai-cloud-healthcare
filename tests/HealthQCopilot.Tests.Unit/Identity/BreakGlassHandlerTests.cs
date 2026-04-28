using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Identity.EventHandlers;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Identity;

// ── BreakGlassAccessGrantedHandler ───────────────────────────────────────────

public class BreakGlassAccessGrantedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<BreakGlassAccessGrantedHandler> _logger =
        Substitute.For<ILogger<BreakGlassAccessGrantedHandler>>();

    [Fact]
    public async Task Handle_PublishesBreakGlassGrantedTopic()
    {
        var handler = new BreakGlassAccessGrantedHandler(_dapr, _logger);
        var evt = new BreakGlassAccessGranted(
            AccessId: Guid.NewGuid(),
            RequestedByUserId: Guid.NewGuid(),
            TargetPatientId: "patient-emergency-001",
            ClinicalJustification: "Patient in cardiac arrest — immediate record access required",
            ExpiresAt: DateTime.UtcNow.AddHours(1));

        await handler.Handle(
            new DomainEventNotification<BreakGlassAccessGranted>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "breakglass.granted",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_PublishesWithCorrectPubSubAndTopic()
    {
        var handler = new BreakGlassAccessGrantedHandler(_dapr, _logger);
        var accessId = Guid.NewGuid();
        var evt = new BreakGlassAccessGranted(
            accessId, Guid.NewGuid(), "p-x", "Emergency access", DateTime.UtcNow.AddMinutes(30));

        await handler.Handle(
            new DomainEventNotification<BreakGlassAccessGranted>(evt), TestContext.Current.CancellationToken);

        // HIPAA critical: must publish to correct component and topic for compliance audit stream
        await _dapr.Received(1).PublishEventAsync(
            Arg.Is("pubsub"),
            Arg.Is("breakglass.granted"),
            Arg.Any<object>(),
            Arg.Any<CancellationToken>());
    }
}

// ── BreakGlassAccessRevokedHandler ───────────────────────────────────────────

public class BreakGlassAccessRevokedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<BreakGlassAccessRevokedHandler> _logger =
        Substitute.For<ILogger<BreakGlassAccessRevokedHandler>>();

    [Fact]
    public async Task Handle_PublishesBreakGlassRevokedTopic()
    {
        var handler = new BreakGlassAccessRevokedHandler(_dapr, _logger);
        var evt = new BreakGlassAccessRevoked(
            AccessId: Guid.NewGuid(),
            RequestedByUserId: Guid.NewGuid(),
            TargetPatientId: "patient-emergency-001",
            RevokedByUserId: Guid.NewGuid());

        await handler.Handle(
            new DomainEventNotification<BreakGlassAccessRevoked>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "breakglass.revoked",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_RevokeDifferentUserThanGrantee_PublishesSuccessfully()
    {
        var handler = new BreakGlassAccessRevokedHandler(_dapr, _logger);
        var granteeId = Guid.NewGuid();
        var supervisorId = Guid.NewGuid(); // supervisor revokes a different user's access
        var evt = new BreakGlassAccessRevoked(
            Guid.NewGuid(), granteeId, "patient-x", supervisorId);

        await handler.Handle(
            new DomainEventNotification<BreakGlassAccessRevoked>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "breakglass.revoked",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
