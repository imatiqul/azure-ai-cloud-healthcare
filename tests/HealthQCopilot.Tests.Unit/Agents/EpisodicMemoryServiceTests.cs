using FluentAssertions;
using HealthQCopilot.Agents.Rag;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Qdrant.Client;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W2.5 — episodic memory short-circuit + fail-safe contract.
/// The service wraps Qdrant; integration with a real Qdrant instance is exercised
/// in the eval / e2e suites. These unit tests pin the *guarantees* the planning
/// loop relies on:
///   1) empty/whitespace inputs MUST short-circuit before any Qdrant or embedder
///      call (so the loop can call recall unconditionally without paying cost),
///   2) the recall path MUST NOT throw — embedder/Qdrant failures degrade to
///      empty string so the LLM still runs without history.
/// Note: the planning loop's recall path is wrapped in its own try/catch (see
/// AgentPlanningLoop W2.5 wiring), so this is defense-in-depth.
/// </summary>
public sealed class EpisodicMemoryServiceTests
{
    private readonly IEmbeddingGenerator<string, Embedding<float>> _embedder
        = Substitute.For<IEmbeddingGenerator<string, Embedding<float>>>();

    // QdrantClient with a fake host — never actually connects because the
    // tests below short-circuit before any RPC.
    private readonly QdrantClient _qdrant = new("localhost", 6334, https: false);

    private EpisodicMemoryService CreateSut() =>
        new(_qdrant, _embedder, NullLogger<EpisodicMemoryService>.Instance);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public async Task RecallSimilarDecisionsAsync_returns_empty_for_blank_input(string query)
    {
        var sut = CreateSut();

        var result = await sut.RecallSimilarDecisionsAsync(query);

        result.Should().BeEmpty();
        await _embedder.DidNotReceive().GenerateAsync(
            Arg.Any<IEnumerable<string>>(),
            Arg.Any<EmbeddingGenerationOptions?>(),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task StoreDecisionAsync_is_noop_for_blank_input(string input)
    {
        var sut = CreateSut();

        var act = async () => await sut.StoreDecisionAsync(
            agentName: "TriageAgent",
            input: input,
            output: "P3",
            guardApproved: true);

        await act.Should().NotThrowAsync();
        await _embedder.DidNotReceive().GenerateAsync(
            Arg.Any<IEnumerable<string>>(),
            Arg.Any<EmbeddingGenerationOptions?>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RecallSimilarDecisionsAsync_swallows_embedder_failure()
    {
        // Recall MUST NOT propagate exceptions — the loop falls back to LLM-only
        // operation when the memory backend is unavailable.
        _embedder.GenerateAsync(
            Arg.Any<IEnumerable<string>>(),
            Arg.Any<EmbeddingGenerationOptions?>(),
            Arg.Any<CancellationToken>())
            .Returns<Task<GeneratedEmbeddings<Embedding<float>>>>(_ => throw new InvalidOperationException("embedder down"));
        var sut = CreateSut();

        var result = await sut.RecallSimilarDecisionsAsync("clinical case");

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task StoreDecisionAsync_swallows_embedder_failure()
    {
        _embedder.GenerateAsync(
            Arg.Any<IEnumerable<string>>(),
            Arg.Any<EmbeddingGenerationOptions?>(),
            Arg.Any<CancellationToken>())
            .Returns<Task<GeneratedEmbeddings<Embedding<float>>>>(_ => throw new InvalidOperationException("embedder down"));
        var sut = CreateSut();

        var act = async () => await sut.StoreDecisionAsync(
            agentName: "TriageAgent",
            input: "patient arrived with chest pain",
            output: "P1",
            guardApproved: true);

        await act.Should().NotThrowAsync();
    }
}
