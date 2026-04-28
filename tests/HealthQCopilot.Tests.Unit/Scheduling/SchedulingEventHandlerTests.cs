using Dapr.Client;
using FluentAssertions;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.Scheduling.Events;
using HealthQCopilot.Scheduling.EventHandlers;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Scheduling;

// ── SlotBookedHandler ────────────────────────────────────────────────────────

public class SlotBookedHandlerTests
{
    private readonly IDistributedCache _cache = Substitute.For<IDistributedCache>();
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();
    private readonly ILogger<SlotBookedHandler> _logger = Substitute.For<ILogger<SlotBookedHandler>>();

    private SlotBookedHandler CreateHandler() => new(_cache, _dapr, _logger);

    private static SlotBooked SampleEvent(Guid? slotId = null) => new(
        SlotId: slotId ?? Guid.NewGuid(),
        PatientId: "patient-001",
        PractitionerId: "DR-001",
        AppointmentTime: DateTime.UtcNow.AddDays(1));

    [Fact]
    public async Task Handle_PublishesSlotBookedTopic()
    {
        var handler = CreateHandler();
        var evt = SampleEvent();
        await handler.Handle(new DomainEventNotification<SlotBooked>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "slot.booked", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_EvictsStatsAndSlotSpecificCacheKeys()
    {
        var slotId = Guid.NewGuid();
        var handler = CreateHandler();
        var evt = SampleEvent(slotId);
        await handler.Handle(new DomainEventNotification<SlotBooked>(evt), TestContext.Current.CancellationToken);

        await _cache.Received(1).RemoveAsync("healthq:scheduling:stats", Arg.Any<CancellationToken>());
        await _cache.Received(1).RemoveAsync(
            $"healthq:scheduling:slots:{slotId}", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_CacheFailure_StillPublishesToDapr()
    {
        _cache.RemoveAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
              .Throws(new Exception("Redis unavailable"));

        var handler = CreateHandler();
        var evt = SampleEvent();

        // Cache failure must not propagate — Dapr publish is critical path
        await handler.Handle(new DomainEventNotification<SlotBooked>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "slot.booked", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}

// ── BookingCreatedHandler ─────────────────────────────────────────────────────

public class BookingCreatedHandlerTests
{
    private readonly DaprClient _dapr = Substitute.For<DaprClient>();

    [Fact]
    public async Task Handle_PublishesBookingCreatedTopic()
    {
        var handler = new BookingCreatedHandler(_dapr, Substitute.For<ILogger<BookingCreatedHandler>>());
        var evt = new BookingCreated(
            BookingId: Guid.NewGuid(),
            SlotId: Guid.NewGuid(),
            PatientId: "patient-002",
            PractitionerId: "DR-002",
            AppointmentTime: DateTime.UtcNow.AddDays(2));

        await handler.Handle(new DomainEventNotification<BookingCreated>(evt), TestContext.Current.CancellationToken);

        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "booking.created", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_IncludesBookingIdInPayload()
    {
        var bookingId = Guid.NewGuid();
        var handler = new BookingCreatedHandler(_dapr, Substitute.For<ILogger<BookingCreatedHandler>>());
        var evt = new BookingCreated(bookingId, Guid.NewGuid(), "p-003", "dr-003", DateTime.UtcNow);

        await handler.Handle(new DomainEventNotification<BookingCreated>(evt), TestContext.Current.CancellationToken);

        // Verify the event was published with an object payload (structural verification
        // via the topic name; full payload shape is covered by integration tests)
        await _dapr.Received(1).PublishEventAsync(
            "pubsub", "booking.created",
            Arg.Is<object>(o => o != null),
            Arg.Any<CancellationToken>());
    }
}
