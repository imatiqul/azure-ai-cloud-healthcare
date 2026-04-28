using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Identity.EventHandlers;
using HealthQCopilot.Notifications.EventHandlers;
using HealthQCopilot.PopulationHealth.EventHandlers;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.EventHandlers;

// ── Identity — Consent ────────────────────────────────────────────────────────

public class ConsentGrantedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Fact]
    public async Task Handle_PublishesConsentGrantedTopic()
    {
        var handler = new ConsentGrantedHandler(_dapr, Substitute.For<ILogger<ConsentGrantedHandler>>());
        var evt = new ConsentGranted(Guid.NewGuid(), Guid.NewGuid(), "treatment", "phi-read");
        var notification = new DomainEventNotification<ConsentGranted>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "consent.granted",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

public class ConsentRevokedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Fact]
    public async Task Handle_PublishesConsentRevokedTopic()
    {
        var handler = new ConsentRevokedHandler(_dapr, Substitute.For<ILogger<ConsentRevokedHandler>>());
        var evt = new ConsentRevoked(Guid.NewGuid(), Guid.NewGuid(), "research", "Patient withdrew");
        var notification = new DomainEventNotification<ConsentRevoked>(evt);

        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "consent.revoked",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_NullReason_PublishesWithoutError()
    {
        var handler = new ConsentRevokedHandler(_dapr, Substitute.For<ILogger<ConsentRevokedHandler>>());
        var evt = new ConsentRevoked(Guid.NewGuid(), Guid.NewGuid(), "payer-data-exchange", null);
        var notification = new DomainEventNotification<ConsentRevoked>(evt);

        // Reason is optional — should not throw
        await handler.Handle(notification, TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "consent.revoked",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── Notifications — Campaign ───────────────────────────────────────────────────

public class CampaignEventHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Fact]
    public async Task CampaignActivated_PublishesCampaignActivatedTopic()
    {
        var handler = new CampaignActivatedHandler(_dapr, Substitute.For<ILogger<CampaignActivatedHandler>>());
        var evt = new CampaignActivated(Guid.NewGuid(), "Flu Outreach Q4", CampaignType.CareGap, DateTime.UtcNow.AddHours(1));
        await handler.Handle(new DomainEventNotification<CampaignActivated>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "campaign.activated",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CampaignCompleted_PublishesCampaignCompletedTopic()
    {
        var handler = new CampaignCompletedHandler(_dapr, Substitute.For<ILogger<CampaignCompletedHandler>>());
        var evt = new CampaignCompleted(Guid.NewGuid(), "Post-Visit Follow-up");
        await handler.Handle(new DomainEventNotification<CampaignCompleted>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "campaign.completed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CampaignCancelled_PublishesCampaignCancelledTopic()
    {
        var handler = new CampaignCancelledHandler(_dapr, Substitute.For<ILogger<CampaignCancelledHandler>>());
        var evt = new CampaignCancelled(Guid.NewGuid(), "Diabetes Reminder");
        await handler.Handle(new DomainEventNotification<CampaignCancelled>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "campaign.cancelled",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── PopulationHealth — PatientRisk ────────────────────────────────────────────

public class PatientRiskAssessedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Theory]
    [InlineData(RiskLevel.Low)]
    [InlineData(RiskLevel.Moderate)]
    [InlineData(RiskLevel.High)]
    [InlineData(RiskLevel.Critical)]
    public async Task Handle_AnyRiskLevel_PublishesPatientRiskAssessedTopic(RiskLevel level)
    {
        var handler = new PatientRiskAssessedHandler(_dapr, Substitute.For<ILogger<PatientRiskAssessedHandler>>());
        var evt = new PatientRiskAssessed(Guid.NewGuid(), "patient-001", level, 0.85, "phi4-medical-v2");
        await handler.Handle(new DomainEventNotification<PatientRiskAssessed>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "patient-risk.assessed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── PopulationHealth — CareGap ────────────────────────────────────────────────

public class CareGapHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Fact]
    public async Task CareGapIdentified_PublishesTopic()
    {
        var handler = new CareGapIdentifiedHandler(_dapr, Substitute.For<ILogger<CareGapIdentifiedHandler>>());
        var evt = new CareGapIdentified(Guid.NewGuid(), "patient-002", "HEDIS-COL", "Colorectal cancer screening due");
        await handler.Handle(new DomainEventNotification<CareGapIdentified>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "care-gap.identified",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CareGapAddressed_PublishesTopic()
    {
        var handler = new CareGapAddressedHandler(_dapr, Substitute.For<ILogger<CareGapAddressedHandler>>());
        var evt = new CareGapAddressed(Guid.NewGuid(), "patient-003", "HEDIS-BCS");
        await handler.Handle(new DomainEventNotification<CareGapAddressed>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "care-gap.addressed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CareGapClosed_PublishesTopic()
    {
        var handler = new CareGapClosedHandler(_dapr, Substitute.For<ILogger<CareGapClosedHandler>>());
        var evt = new CareGapClosed(Guid.NewGuid(), "patient-004", "HEDIS-CDC");
        await handler.Handle(new DomainEventNotification<CareGapClosed>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "care-gap.closed",
            Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── Domain model domain event wiring tests ────────────────────────────────────

public class OutreachCampaignDomainEventTests
{
    [Fact]
    public void Activate_RaisesCampaignActivatedEvent()
    {
        var campaign = OutreachCampaign.Create(Guid.NewGuid(), "Test Campaign", CampaignType.Reminder, "all");
        var scheduledAt = DateTime.UtcNow.AddHours(2);

        campaign.Activate(scheduledAt);

        campaign.DomainEvents.Should().ContainSingle(e => e is CampaignActivated);
        var evt = (CampaignActivated)campaign.DomainEvents.Single();
        evt.Name.Should().Be("Test Campaign");
        evt.ScheduledAt.Should().Be(scheduledAt);
    }

    [Fact]
    public void Complete_RaisesCampaignCompletedEvent()
    {
        var campaign = OutreachCampaign.Create(Guid.NewGuid(), "Test", CampaignType.FollowUp, "");
        campaign.Complete();
        campaign.DomainEvents.Should().ContainSingle(e => e is CampaignCompleted);
    }

    [Fact]
    public void Cancel_RaisesCampaignCancelledEvent()
    {
        var campaign = OutreachCampaign.Create(Guid.NewGuid(), "Test", CampaignType.Custom, "");
        campaign.Cancel();
        campaign.DomainEvents.Should().ContainSingle(e => e is CampaignCancelled);
    }
}

public class PatientRiskDomainEventTests
{
    [Fact]
    public void Create_RaisesPatientRiskAssessedEvent()
    {
        var risk = PatientRisk.Create("patient-x", RiskLevel.High, 0.92, "phi4-v1", ["diabetes", "hypertension"]);

        risk.DomainEvents.Should().ContainSingle(e => e is PatientRiskAssessed);
        var evt = (PatientRiskAssessed)risk.DomainEvents.Single();
        evt.PatientId.Should().Be("patient-x");
        evt.Level.Should().Be(RiskLevel.High);
        evt.RiskScore.Should().BeApproximately(0.92, 0.001);
    }
}

public class CareGapDomainEventTests
{
    [Fact]
    public void Create_RaisesCareGapIdentifiedEvent()
    {
        var gap = CareGap.Create("patient-y", "HEDIS-COL", "Colorectal screening due");
        gap.DomainEvents.Should().ContainSingle(e => e is CareGapIdentified);
    }

    [Fact]
    public void Address_RaisesCareGapAddressedEvent()
    {
        var gap = CareGap.Create("patient-y", "HEDIS-COL", "Colorectal screening due");
        gap.ClearDomainEvents();
        gap.Address();
        gap.DomainEvents.Should().ContainSingle(e => e is CareGapAddressed);
    }

    [Fact]
    public void Close_RaisesCareGapClosedEvent()
    {
        var gap = CareGap.Create("patient-y", "HEDIS-COL", "Colorectal screening due");
        gap.ClearDomainEvents();
        gap.Close();
        gap.DomainEvents.Should().ContainSingle(e => e is CareGapClosed);
    }
}
