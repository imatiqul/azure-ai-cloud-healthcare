using FluentAssertions;
using HealthQCopilot.Domain.Scheduling;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Domain;

public class WaitlistEntryTests
{
    private static WaitlistEntry CreateEntry(
        int priority = 3,
        string patientId = "patient-001",
        string practitionerId = "DR-001") =>
        WaitlistEntry.Create(
            patientId,
            practitionerId,
            preferredFrom: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            preferredTo: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)),
            priority: priority);

    // ── Create ────────────────────────────────────────────────────────────────

    [Fact]
    public void Create_SetsPropertiesAndWaitingStatus()
    {
        var entry = CreateEntry();

        entry.Id.Should().NotBeEmpty();
        entry.PatientId.Should().Be("patient-001");
        entry.PractitionerId.Should().Be("DR-001");
        entry.Priority.Should().Be(3);
        entry.Status.Should().Be(WaitlistStatus.Waiting);
        entry.PromotedAt.Should().BeNull();
        entry.PromotedToBookingId.Should().BeNull();
    }

    [Fact]
    public void Create_DefaultsPriorityToFiveWhenNotSpecified()
    {
        var entry = WaitlistEntry.Create(
            "p", "dr",
            DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)));

        entry.Priority.Should().Be(5);
    }

    [Theory]
    [InlineData(1)] // urgent
    [InlineData(3)] // normal
    [InlineData(5)] // routine
    public void Create_ValidPriority_Succeeds(int priority)
    {
        var act = () => CreateEntry(priority);

        act.Should().NotThrow();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public void Create_InvalidPriority_Throws(int priority)
    {
        var act = () => CreateEntry(priority);

        act.Should().Throw<ArgumentOutOfRangeException>()
            .WithMessage("*priority*");
    }

    [Fact]
    public void Create_PreferredToBeforeFrom_Throws()
    {
        var act = () => WaitlistEntry.Create(
            "p", "dr",
            preferredFrom: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)),
            preferredTo: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)));

        act.Should().Throw<ArgumentException>()
            .WithMessage("*preferredTo*");
    }

    // ── Promote ───────────────────────────────────────────────────────────────

    [Fact]
    public void Promote_WhenWaiting_TransitionsToPromotedAndSetsBookingId()
    {
        var entry = CreateEntry();
        var bookingId = Guid.NewGuid();

        var result = entry.Promote(bookingId);

        result.IsSuccess.Should().BeTrue();
        entry.Status.Should().Be(WaitlistStatus.Promoted);
        entry.PromotedToBookingId.Should().Be(bookingId);
        entry.PromotedAt.Should().NotBeNull()
            .And.Subject.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Promote_WhenAlreadyPromoted_ReturnsFailure()
    {
        var entry = CreateEntry();
        entry.Promote(Guid.NewGuid());

        var result = entry.Promote(Guid.NewGuid());

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Contain("Promoted");
    }

    [Fact]
    public void Promote_WhenCancelled_ReturnsFailure()
    {
        var entry = CreateEntry();
        entry.Cancel();

        var result = entry.Promote(Guid.NewGuid());

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Contain("Cancelled");
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    [Fact]
    public void Cancel_WhenWaiting_TransitionsToCancelled()
    {
        var entry = CreateEntry();

        var result = entry.Cancel();

        result.IsSuccess.Should().BeTrue();
        entry.Status.Should().Be(WaitlistStatus.Cancelled);
    }

    [Fact]
    public void Cancel_WhenAlreadyCancelled_ReturnsFailure()
    {
        var entry = CreateEntry();
        entry.Cancel();

        var result = entry.Cancel();

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Contain("waiting");
    }

    [Fact]
    public void Cancel_WhenPromoted_ReturnsFailure()
    {
        var entry = CreateEntry();
        entry.Promote(Guid.NewGuid());

        var result = entry.Cancel();

        result.IsFailure.Should().BeTrue();
    }
}
