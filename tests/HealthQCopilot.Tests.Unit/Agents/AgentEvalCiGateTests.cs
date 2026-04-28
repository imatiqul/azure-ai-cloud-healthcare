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

/// <summary>
/// W3.5 — CI gate. Runs the real golden set through <see cref="ClinicalEvaluator"/>
/// using a deterministic stub chat that echoes the first <c>ExpectedContains</c>
/// phrase per case. Asserts accuracy stays within 2 percentage points of the
/// committed baseline so a regression in evaluator wiring, scoring rules, or
/// golden-set schema fails the PR. Tagged <c>Category=Eval</c> so the
/// <c>agent-eval.yml</c> workflow can target it independently.
/// </summary>
[Trait("Category", "Eval")]
public sealed class AgentEvalCiGateTests
{
    /// <summary>
    /// Baseline accuracy committed to source. The CI gate fails on regressions
    /// > 2pp; bump intentionally when the golden set or scoring tightens.
    /// </summary>
    private const double TriageBaselineAccuracy = 1.0;
    private const double MaxRegressionPp = 0.02;

    [Fact]
    public async Task Triage_golden_set_meets_baseline_minus_2pp()
    {
        var loader = new FileClinicalCaseLoader(
            Options.Create(new ClinicalEvalOptions
            {
                // Golden sets are copied to the Agents project's bin/<Tfm>/Evaluation/golden-sets,
                // which is also where this test assembly's bin lives. Walk to the Agents bin.
                GoldenSetDirectory = ResolveGoldenSetDirectory(),
            }),
            NullLogger<FileClinicalCaseLoader>.Instance);

        var cases = await loader.LoadAsync("triage");
        cases.Should().NotBeEmpty("golden-sets/triage.json must ship with the build");

        var stubChat = new GoldenStubChat(cases);
        var sut = new ClinicalEvaluator(
            loader,
            stubChat,
            Substitute.For<IGroundednessJudge>(),
            Substitute.For<IToxicityScreener>(),
            Options.Create(new ClinicalEvalOptions
            {
                GoldenSetDirectory = ResolveGoldenSetDirectory(),
                ModelId = "ci-stub",
                PromptId = "triage",
                PromptVersion = "ci",
            }),
            NullLogger<ClinicalEvaluator>.Instance);

        var report = await sut.EvaluateAsync("triage");

        report.AccuracyScore.Should().BeGreaterThanOrEqualTo(
            TriageBaselineAccuracy - MaxRegressionPp,
            "regression of more than {0}pp on the triage golden set is a hard PR gate",
            MaxRegressionPp * 100);
    }

    private static string ResolveGoldenSetDirectory()
    {
        // The Agents project copies golden-sets to its own bin output. The test
        // assembly's bin is sibling, so we resolve relative to the repository
        // src tree which is stable in CI checkouts.
        var here = AppContext.BaseDirectory;
        var dir = new DirectoryInfo(here);
        while (dir is not null && !dir.GetDirectories("src").Any())
            dir = dir.Parent;
        if (dir is null)
            throw new InvalidOperationException("Unable to locate repository root from " + here);
        return Path.Combine(dir.FullName, "src", "HealthQCopilot.Agents", "Evaluation", "golden-sets");
    }

    /// <summary>Deterministic chat stub that emits the first ExpectedContains phrase per case keyed by Input.</summary>
    private sealed class GoldenStubChat : IChatCompletionService
    {
        private readonly Dictionary<string, string> _byInput;
        public GoldenStubChat(IReadOnlyList<ClinicalEvalCase> cases)
        {
            _byInput = cases.ToDictionary(
                c => c.Input,
                c => c.ExpectedContains is { Count: > 0 } ? c.ExpectedContains[0] : string.Empty,
                StringComparer.Ordinal);
        }

        public IReadOnlyDictionary<string, object?> Attributes { get; } = new Dictionary<string, object?>();

        public Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
            ChatHistory chatHistory,
            Microsoft.SemanticKernel.PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            CancellationToken cancellationToken = default)
        {
            var userMsg = chatHistory.LastOrDefault(m => m.Role == AuthorRole.User)?.Content ?? string.Empty;
            _byInput.TryGetValue(userMsg, out var content);
            return Task.FromResult<IReadOnlyList<ChatMessageContent>>(
                [new ChatMessageContent(AuthorRole.Assistant, content ?? string.Empty)]);
        }

        public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
            ChatHistory chatHistory,
            Microsoft.SemanticKernel.PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            yield return new StreamingChatMessageContent(AuthorRole.Assistant, string.Empty);
            await Task.CompletedTask;
        }
    }
}
