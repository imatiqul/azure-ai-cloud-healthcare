using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W1.1 — verifies the regex-based PHI redactor produces deterministic
/// reversible token maps and never lets common HIPAA identifiers through.
/// </summary>
public sealed class RegexPhiRedactorTests
{
    private readonly RegexPhiRedactor _sut = new(NullLogger<RegexPhiRedactor>.Instance);

    [Theory]
    [InlineData("SSN 123-45-6789 should be masked")]
    [InlineData("MRN: 0001234567 in chart")]
    [InlineData("Call patient at (555) 123-4567 today")]
    [InlineData("email me at jane.doe@example.com")]
    [InlineData("DOB 03/14/1985 noted")]
    public async Task RedactAsync_masks_all_supported_phi_kinds(string input)
    {
        var result = await _sut.RedactAsync(input, sessionId: "s1");

        result.RedactedText.Should().NotContain("123-45-6789")
            .And.NotContain("0001234567")
            .And.NotContain("(555) 123-4567")
            .And.NotContain("jane.doe@example.com")
            .And.NotContain("03/14/1985");
        result.Entities.Should().NotBeEmpty();
        result.TokenMap.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Rehydrate_restores_original_values_from_token_map()
    {
        const string original = "Patient SSN 123-45-6789, phone (555) 123-4567.";
        var redaction = await _sut.RedactAsync(original, sessionId: "s1");

        var rehydrated = _sut.Rehydrate(redaction.RedactedText, redaction.TokenMap);

        rehydrated.Should().Be(original);
    }

    [Fact]
    public async Task RedactAsync_is_deterministic_for_same_input_and_session()
    {
        const string input = "SSN 999-00-1111 and MRN 9876543210";

        var a = await _sut.RedactAsync(input, sessionId: "s1");
        var b = await _sut.RedactAsync(input, sessionId: "s1");

        a.RedactedText.Should().Be(b.RedactedText);
    }
}
