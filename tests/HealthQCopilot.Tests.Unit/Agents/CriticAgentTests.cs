using FluentAssertions;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W2.3 — cross-agent validator. Verifies that <see cref="CriticAgent"/>
/// returns SUPPORTED/UNSUPPORTED based on the LLM judge response, treats
/// missing citations as <see cref="CriticVerdict.NotApplicable"/>, and never
/// throws on LLM failure.
/// </summary>
public sealed class CriticAgentTests
{
    private readonly IChatCompletionService _chat = Substitute.For<IChatCompletionService>();
    private readonly BusinessMetrics _metrics =
        new(new ServiceCollection().AddMetrics().BuildServiceProvider().GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());

    [Fact]
    public async Task ReviewAsync_returns_NotApplicable_when_no_citations()
    {
        var sut = CreateSut();
        var verdict = await sut.ReviewAsync("any answer", Array.Empty<RagCitation>());
        verdict.Should().BeSameAs(CriticVerdict.NotApplicable);
        verdict.Supported.Should().BeTrue();
    }

    [Fact]
    public async Task ReviewAsync_marks_supported_when_judge_says_SUPPORTED()
    {
        ConfigureChatResponse("VERDICT: SUPPORTED; SCORE: 0.92; REASON: Matches citation [1] dosage.");
        var sut = CreateSut();
        var citations = new[]
        {
            new RagCitation("c1", "ACR Triage Protocol", null, 0.9, "Acuity 2 for chest pain >40."),
        };

        var verdict = await sut.ReviewAsync("Triage as acuity 2.", citations);

        verdict.Supported.Should().BeTrue();
        verdict.Confidence.Should().BeApproximately(0.92, 0.001);
    }

    [Fact]
    public async Task ReviewAsync_marks_unsupported_when_judge_says_UNSUPPORTED()
    {
        ConfigureChatResponse("VERDICT: UNSUPPORTED; SCORE: 0.10; REASON: Citation does not mention this drug.");
        var sut = CreateSut();
        var citations = new[] { new RagCitation("c1", "Formulary", null, 0.7, "Aspirin 81mg.") };

        var verdict = await sut.ReviewAsync("Prescribe rifampin 600mg.", citations);

        verdict.Supported.Should().BeFalse();
        verdict.Confidence.Should().BeApproximately(0.10, 0.001);
    }

    [Fact]
    public async Task ReviewAsync_returns_low_confidence_passthrough_on_llm_failure()
    {
        _chat.GetChatMessageContentsAsync(
                Arg.Any<ChatHistory>(),
                Arg.Any<PromptExecutionSettings>(),
                Arg.Any<Kernel?>(),
                Arg.Any<CancellationToken>())
            .Returns<Task<IReadOnlyList<ChatMessageContent>>>(_ => throw new InvalidOperationException("upstream timeout"));

        var sut = CreateSut();
        var citations = new[] { new RagCitation("c1", "Doc", null, 0.5, null) };

        var verdict = await sut.ReviewAsync("any answer", citations);

        verdict.Supported.Should().BeTrue();
        verdict.Confidence.Should().Be(0d);
        verdict.Reason.Should().StartWith("critic-error:");
    }

    private CriticAgent CreateSut() => new(_chat, _metrics, NullLogger<CriticAgent>.Instance);

    private void ConfigureChatResponse(string content)
    {
        _chat.GetChatMessageContentsAsync(
                Arg.Any<ChatHistory>(),
                Arg.Any<PromptExecutionSettings>(),
                Arg.Any<Kernel?>(),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<ChatMessageContent>>(
                new[] { new ChatMessageContent(AuthorRole.Assistant, content) }));
    }
}
