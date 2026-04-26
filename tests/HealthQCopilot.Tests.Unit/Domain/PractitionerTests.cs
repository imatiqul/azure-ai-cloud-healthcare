using FluentAssertions;
using HealthQCopilot.Domain.Scheduling;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Domain;

public class PractitionerTests
{
    private static Practitioner CreatePractitioner(
        string practitionerId = "NPI-1234567890",
        string name = "Dr. Jane Smith",
        string specialty = "Cardiology",
        string email = "jane.smith@healthq.io",
        TimeOnly? start = null,
        TimeOnly? end = null,
        string timeZoneId = "UTC") =>
        Practitioner.Create(
            practitionerId, name, specialty, email,
            start ?? new TimeOnly(8, 0),
            end ?? new TimeOnly(17, 0),
            timeZoneId);

    // ── Create ────────────────────────────────────────────────────────────────

    [Fact]
    public void Create_SetsAllPropertiesCorrectly()
    {
        var p = CreatePractitioner();

        p.Id.Should().NotBeEmpty();
        p.PractitionerId.Should().Be("NPI-1234567890");
        p.Name.Should().Be("Dr. Jane Smith");
        p.Specialty.Should().Be("Cardiology");
        p.Email.Should().Be("jane.smith@healthq.io");
        p.AvailabilityStart.Should().Be(new TimeOnly(8, 0));
        p.AvailabilityEnd.Should().Be(new TimeOnly(17, 0));
        p.TimeZoneId.Should().Be("UTC");
        p.IsActive.Should().BeTrue();
        p.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(2));
        p.UpdatedAt.Should().BeNull();
    }

    [Fact]
    public void Create_WithCustomTimeZone_SetsTimeZoneId()
    {
        var p = CreatePractitioner(timeZoneId: "America/New_York");

        p.TimeZoneId.Should().Be("America/New_York");
    }

    // ── Update ────────────────────────────────────────────────────────────────

    [Fact]
    public void Update_ChangesPropertiesAndSetsUpdatedAt()
    {
        var p = CreatePractitioner();

        p.Update("Dr. Jane Williams", "Cardiology/EP",
                  "jane.williams@healthq.io",
                  new TimeOnly(9, 0), new TimeOnly(18, 0), "Europe/London");

        p.Name.Should().Be("Dr. Jane Williams");
        p.Specialty.Should().Be("Cardiology/EP");
        p.Email.Should().Be("jane.williams@healthq.io");
        p.AvailabilityStart.Should().Be(new TimeOnly(9, 0));
        p.AvailabilityEnd.Should().Be(new TimeOnly(18, 0));
        p.TimeZoneId.Should().Be("Europe/London");
        p.UpdatedAt.Should().NotBeNull()
            .And.Subject.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Update_DoesNotChangeId()
    {
        var p = CreatePractitioner();
        var originalId = p.Id;

        p.Update("New Name", "General", "new@healthq.io",
                  new TimeOnly(7, 0), new TimeOnly(15, 0), "UTC");

        p.Id.Should().Be(originalId);
    }

    // ── Deactivate / Activate ─────────────────────────────────────────────────

    [Fact]
    public void Deactivate_SetsIsActiveToFalseAndUpdatesTimestamp()
    {
        var p = CreatePractitioner();

        p.Deactivate();

        p.IsActive.Should().BeFalse();
        p.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public void Activate_AfterDeactivate_SetsIsActiveToTrue()
    {
        var p = CreatePractitioner();
        p.Deactivate();

        p.Activate();

        p.IsActive.Should().BeTrue();
        p.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public void Deactivate_ThenActivate_UpdatesUpdatedAtEachTime()
    {
        var p = CreatePractitioner();
        p.Deactivate();
        var afterDeactivate = p.UpdatedAt;

        p.Activate();

        p.UpdatedAt.Should().BeOnOrAfter(afterDeactivate!.Value);
    }
}
