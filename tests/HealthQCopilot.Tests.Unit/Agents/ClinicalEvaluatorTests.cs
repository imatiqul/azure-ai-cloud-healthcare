using System.Runtime.CompilerServices;
using FluentAssertions;
using HealthQCopilot.Agents.Evaluation;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

public sealed class ClinicalEvaluatorTests
{
    private readonly IClinicalCaseLoader _loader = Substitute.For<IClinicalCaseLoader>();
    private readonly IGroundednessJudge _judge = Substitute.For<IGroundednessJudge>();
    private readonly IToxicityScreener _toxicity = Substitute.For<IToxicityScreener>();
    private readonly IOptions<ClinicalEvalOptions> _options = Options.Create(new ClinicalEvalOptions
    {
        ModelId = "gpt-test",
        PromptId = "triage",
        PromptVersion = "v1",
    });

    [Fact]
    public async Task EvaluateAsync_passes_when_response_contains_expected_phrase()
    {
        _loader.LoadAsync("triage", Arg.Any<CancellationToken>()).Returns(new List<ClinicalEvalCase>
        {
            new("c1", "high-acuity", null, "chest pain", new[] { "ER" }, null),
        });
        var sut = CreateSut(returnContent: "Recommend ER immediately.");

        var report = await sut.EvaluateAsync("triage");

        report.TotalCases.Should().Be(1);
        report.Passed.Should().Be(1);
        report.AccuracyScore.Should().Be(1.0);
        report.Cases[0].Passed.Should().BeTrue();
    }

    [Fact]
    public async Task EvaluateAsync_fails_case_when_must_not_contain_violated()
    {
        _loader.LoadAsync("triage", Arg.Any<CancellationToken>()).Returns(new List<ClinicalEvalCase>
        {
            new("c2", "low", null, "common cold", new[] { "self-care" }, new[] { "ER" }),
        });
        var sut = CreateSut(returnContent: "Go to the ER right away.");

        var report = await sut.EvaluateAsync("triage");

        report.Failed.Should().Be(1);
        report.Cases[0].Passed.Should().BeFalse();
        report.Cases[0].FailureReason.Should().Contain("forbidden");
    }

    [Fact]
    public async Task EvaluateAsync_returns_empty_report_when_no_cases()
    {
        _loader.LoadAsync("triage", Arg.Any<CancellationToken>()).Returns(new List<ClinicalEvalCase>());
        var sut = CreateSut(returnContent: "anything");

        var report = await sut.EvaluateAsync("triage");

        report.TotalCases.Should().Be(0);
        report.AccuracyScore.Should().Be(0.0);
        report.ModelId.Should().Be("gpt-test");
        report.PromptVersion.Should().Be("v1");
    }

    [Fact]
    public async Task EvaluateAsync_averages_groundedness_when_context_provided()
    {
        _loader.LoadAsync("triage", Arg.Any<CancellationToken>()).Returns(new List<ClinicalEvalCase>
        {
            new("g1", "moderate", null, "what's the dose?", new[] { "200mg" }, null, new[] { "Recommended dose: 200mg twice daily." }),
            new("g2", "moderate", null, "any contraindications?", new[] { "kidney" }, null, new[] { "Avoid in severe kidney disease." }),
        });
        _judge.JudgeAsync(Arg.Any<string>(), Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns(0.8, 0.6);
        var sut = CreateSut(returnContent: "Take 200mg; avoid in severe kidney disease.");

        var report = await sut.EvaluateAsync("triage");

        report.GroundednessScore.Should().BeApproximately(0.7, 0.0001);
        report.Cases.Should().AllSatisfy(c => c.Confidence.Should().NotBeNull());
    }

    [Fact]
    public async Task EvaluateAsync_records_toxicity_severity_and_aggregates_mean()
    {
        _loader.LoadAsync("triage", Arg.Any<CancellationToken>()).Returns(new List<ClinicalEvalCase>
        {
            new("t1", "low", null, "input one", new[] { "ok" }, null),
            new("t2", "low", null, "input two", new[] { "ok" }, null),
        });
        _toxicity.ScreenAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
                new ToxicityResult(false, 0.2, "Hate", new Dictionary<string, double> { ["Hate"] = 0.2 }),
                new ToxicityResult(true, 0.8, "Violence", new Dictionary<string, double> { ["Violence"] = 0.8 }));
        var sut = CreateSut(returnContent: "ok response");

        var report = await sut.EvaluateAsync("triage");

        report.ToxicityScore.Should().BeApproximately(0.5, 0.0001);
        report.Cases[0].ToxicitySeverity.Should().BeApproximately(0.2, 0.0001);
        report.Cases[1].ToxicitySeverity.Should().BeApproximately(0.8, 0.0001);
    }

    private ClinicalEvaluator CreateSut(string returnContent)
        => new(_loader, new FakeChat(returnContent), _judge, _toxicity, _options, NullLogger<ClinicalEvaluator>.Instance);

    private sealed class FakeChat(string content) : IChatCompletionService
    {
        public IReadOnlyDictionary<string, object?> Attributes { get; } = new Dictionary<string, object?>();

        public Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
            ChatHistory chatHistory,
            Microsoft.SemanticKernel.PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<ChatMessageContent>>(
                [new ChatMessageContent(Microsoft.SemanticKernel.ChatCompletion.AuthorRole.Assistant, content)]);

        public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
            ChatHistory chatHistory,
            Microsoft.SemanticKernel.PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            yield return new StreamingChatMessageContent(Microsoft.SemanticKernel.ChatCompletion.AuthorRole.Assistant, content);
            await Task.CompletedTask;
        }
    }
}
