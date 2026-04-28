using FluentAssertions;
using HealthQCopilot.Agents.Prompts;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W4.5 — guards the seam every agent now reads through. The registry MUST
/// expose all canonical ids at well-known versions; missing keys must throw
/// rather than silently degrade so prompt drift is caught at startup.
/// </summary>
public sealed class InMemoryPromptRegistryTests
{
    private readonly InMemoryPromptRegistry _sut = new();

    [Theory]
    [InlineData(InMemoryPromptRegistry.Ids.TriageReasoning,    "1.1")]
    [InlineData(InMemoryPromptRegistry.Ids.HallucinationJudge, "1.0")]
    [InlineData(InMemoryPromptRegistry.Ids.ClinicalCoder,      "1.1")]
    [InlineData(InMemoryPromptRegistry.Ids.CriticReviewer,     "1.0")]
    public void Get_returns_a_seeded_prompt_at_the_pinned_version(string id, string expectedVersion)
    {
        var def = _sut.Get(id);

        def.Id.Should().Be(id);
        def.Version.Should().Be(expectedVersion);
        def.Template.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Get_throws_KeyNotFound_for_unregistered_id()
    {
        var act = () => _sut.Get("does.not.exist");
        act.Should().Throw<KeyNotFoundException>().WithMessage("*does.not.exist*");
    }

    [Fact]
    public void TryGet_returns_false_for_unregistered_id()
    {
        var ok = _sut.TryGet("nope", out var def);
        ok.Should().BeFalse();
        def.Should().BeNull();
    }

    [Fact]
    public void Triage_reasoning_prompt_matches_v1_1_wording()
    {
        // W1.4 — v1.1 prefixes the legacy triage prompt with binding HIPAA +
        // non-definitive-diagnosis safety directives. Rolling this string
        // forward again requires bumping to v1.2+ AND updating the eval
        // golden set so the regression CI gate stays meaningful.
        var def = _sut.Get(InMemoryPromptRegistry.Ids.TriageReasoning);

        def.Template.Should().StartWith("SAFETY DIRECTIVES");
        def.Template.Should().Contain("Never include direct PHI identifiers");
        def.Template.Should().Contain("Never issue a definitive diagnosis");
        def.Template.Should().Contain("You are a senior emergency medicine physician");
        def.Template.Should().Contain("numbered reasoning steps");
    }

    [Fact]
    public void Clinical_coder_prompt_carries_v1_1_safety_prefix()
    {
        var def = _sut.Get(InMemoryPromptRegistry.Ids.ClinicalCoder);

        def.Template.Should().StartWith("SAFETY DIRECTIVES");
        def.Template.Should().Contain("Never echo direct PHI identifiers");
        def.Template.Should().Contain("board-certified clinical coding specialist");
    }
}
