using FluentAssertions;
using HealthQCopilot.Infrastructure.Observability;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// Phase 35 — verifies that <see cref="PhiRedactionProcessor.Redact"/> scrubs all
/// HIPAA Safe-Harbor identifiers before log records are exported through the
/// native OpenTelemetry pipeline.
/// </summary>
public sealed class PhiRedactionProcessorTests
{
    // ── SSN ───────────────────────────────────────────────────────────────────

    [Fact]
    public void Redact_replaces_ssn()
    {
        var result = PhiRedactionProcessor.Redact("Patient SSN 123-45-6789 on file.");
        result.Should().Contain("[SSN-REDACTED]")
              .And.NotContain("123-45-6789");
    }

    // ── Phone numbers ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Call (555) 123-4567 now")]
    [InlineData("Reach us at 555-123-4567")]
    [InlineData("Digits: 5551234567")]
    public void Redact_replaces_us_phone_numbers(string input)
    {
        var result = PhiRedactionProcessor.Redact(input);
        result.Should().Contain("[PHONE-REDACTED]");
    }

    // ── Email ─────────────────────────────────────────────────────────────────

    [Fact]
    public void Redact_replaces_email_address()
    {
        var result = PhiRedactionProcessor.Redact("Contact: jane.doe@example.com today.");
        result.Should().Contain("[EMAIL-REDACTED]")
              .And.NotContain("jane.doe@example.com");
    }

    // ── MRN / Patient ID ──────────────────────────────────────────────────────

    [Theory]
    [InlineData("MRN-123456 admitted")]
    [InlineData("PID:987654 updated")]
    [InlineData("PAT7654321 discharged")]
    public void Redact_replaces_mrn_patterns(string input)
    {
        var result = PhiRedactionProcessor.Redact(input);
        result.Should().Contain("[MRN-REDACTED]");
    }

    // ── Date of Birth ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("DOB 03/14/1985")]
    [InlineData("Born 1985-03-14 per record")]
    public void Redact_replaces_date_of_birth(string input)
    {
        var result = PhiRedactionProcessor.Redact(input);
        result.Should().Contain("[DOB-REDACTED]");
    }

    // ── Credit card ───────────────────────────────────────────────────────────

    [Fact]
    public void Redact_replaces_credit_card_number()
    {
        var result = PhiRedactionProcessor.Redact("Card 4111111111111111 on file.");
        result.Should().Contain("[CARD-REDACTED]")
              .And.NotContain("4111111111111111");
    }

    // ── Clean input passthrough ───────────────────────────────────────────────

    [Fact]
    public void Redact_returns_original_string_when_no_phi_present()
    {
        const string clean = "Service started successfully. Listening on port 8080.";
        var result = PhiRedactionProcessor.Redact(clean);
        result.Should().Be(clean);
    }

    // ── Multiple PHI in one string ────────────────────────────────────────────

    [Fact]
    public void Redact_handles_multiple_phi_kinds_in_one_string()
    {
        const string input = "Patient SSN 123-45-6789 email john@clinic.com DOB 01/01/1990.";
        var result = PhiRedactionProcessor.Redact(input);
        result.Should().Contain("[SSN-REDACTED]")
              .And.Contain("[EMAIL-REDACTED]")
              .And.Contain("[DOB-REDACTED]")
              .And.NotContain("123-45-6789")
              .And.NotContain("john@clinic.com")
              .And.NotContain("01/01/1990");
    }
}
