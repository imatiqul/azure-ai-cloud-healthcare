using FluentAssertions;
using HealthQCopilot.Agents.Prompts;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W4.5b — verifies the Cosmos-backed <see cref="IAgentPromptRegistry"/> resolves
/// active platform-default prompts from Cosmos, falls back to the in-memory seed
/// on miss / failure, and never propagates Cosmos exceptions to the orchestrator.
/// </summary>
public sealed class CosmosAgentPromptRegistryTests
{
    private readonly Container _container = Substitute.For<Container>();
    private readonly InMemoryPromptRegistry _inner = new();

    [Fact]
    public void TryGet_returns_cosmos_document_when_present()
    {
        StubQuery(InMemoryPromptRegistry.Ids.TriageReasoning, new[]
        {
            new CosmosAgentPromptRegistry.PromptDoc(
                id: $"{InMemoryPromptRegistry.Ids.TriageReasoning}:default:7",
                promptKey: InMemoryPromptRegistry.Ids.TriageReasoning,
                tenantId: "default",
                version: 7,
                body: "COSMOS BODY v7",
                active: true),
        });
        var sut = CreateSut();

        var found = sut.TryGet(InMemoryPromptRegistry.Ids.TriageReasoning, out var def);

        found.Should().BeTrue();
        def.Id.Should().Be(InMemoryPromptRegistry.Ids.TriageReasoning);
        def.Version.Should().Be("7.0");
        def.Template.Should().Be("COSMOS BODY v7");
    }

    [Fact]
    public void Get_falls_back_to_inner_seed_when_cosmos_returns_no_doc()
    {
        StubEmpty(InMemoryPromptRegistry.Ids.TriageReasoning);
        var sut = CreateSut();

        var def = sut.Get(InMemoryPromptRegistry.Ids.TriageReasoning);

        def.Should().BeEquivalentTo(_inner.Get(InMemoryPromptRegistry.Ids.TriageReasoning));
    }

    [Fact]
    public void Get_falls_back_to_inner_seed_when_cosmos_throws()
    {
        var failing = Substitute.For<FeedIterator<CosmosAgentPromptRegistry.PromptDoc>>();
        failing.HasMoreResults.Returns(true);
        failing.ReadNextAsync(Arg.Any<CancellationToken>())
            .Throws(new CosmosException("boom", System.Net.HttpStatusCode.ServiceUnavailable, 0, "x", 0));
        _container.GetItemQueryIterator<CosmosAgentPromptRegistry.PromptDoc>(
                Arg.Any<QueryDefinition>(),
                Arg.Any<string?>(),
                Arg.Any<QueryRequestOptions?>())
            .Returns(failing);
        var sut = CreateSut();

        var def = sut.Get(InMemoryPromptRegistry.Ids.HallucinationJudge);

        def.Should().BeEquivalentTo(_inner.Get(InMemoryPromptRegistry.Ids.HallucinationJudge));
    }

    [Fact]
    public void TryGet_caches_resolved_doc_so_second_call_skips_cosmos()
    {
        StubQuery(InMemoryPromptRegistry.Ids.CriticReviewer, new[]
        {
            new CosmosAgentPromptRegistry.PromptDoc(
                id: $"{InMemoryPromptRegistry.Ids.CriticReviewer}:default:2",
                promptKey: InMemoryPromptRegistry.Ids.CriticReviewer,
                tenantId: "default",
                version: 2,
                body: "CRITIC v2",
                active: true),
        });
        var sut = CreateSut();

        sut.TryGet(InMemoryPromptRegistry.Ids.CriticReviewer, out _).Should().BeTrue();
        sut.TryGet(InMemoryPromptRegistry.Ids.CriticReviewer, out var def).Should().BeTrue();

        def.Template.Should().Be("CRITIC v2");
        // First call hits Cosmos; second call must be served from cache.
        _container.Received(1).GetItemQueryIterator<CosmosAgentPromptRegistry.PromptDoc>(
            Arg.Any<QueryDefinition>(),
            Arg.Any<string?>(),
            Arg.Any<QueryRequestOptions?>());
    }

    private CosmosAgentPromptRegistry CreateSut() => new(
        _container, _inner, NullLogger<CosmosAgentPromptRegistry>.Instance);

    private void StubQuery(string promptKey, IEnumerable<CosmosAgentPromptRegistry.PromptDoc> docs)
    {
        var iterator = Substitute.For<FeedIterator<CosmosAgentPromptRegistry.PromptDoc>>();
        var calls = 0;
        iterator.HasMoreResults.Returns(_ => calls++ == 0);
        var feed = Substitute.For<FeedResponse<CosmosAgentPromptRegistry.PromptDoc>>();
        feed.GetEnumerator().Returns(_ => docs.GetEnumerator());
        iterator.ReadNextAsync(Arg.Any<CancellationToken>()).Returns(feed);
        _container.GetItemQueryIterator<CosmosAgentPromptRegistry.PromptDoc>(
                Arg.Is<QueryDefinition>(q => MatchesParams(q, promptKey)),
                Arg.Any<string?>(),
                Arg.Any<QueryRequestOptions?>())
            .Returns(iterator);
    }

    private void StubEmpty(string promptKey) =>
        StubQuery(promptKey, Array.Empty<CosmosAgentPromptRegistry.PromptDoc>());

    private static bool MatchesParams(QueryDefinition q, string promptKey)
    {
        var ps = q.GetQueryParameters();
        return ps.Any(p => p.Name == "@k" && (string)p.Value! == promptKey)
            && ps.Any(p => p.Name == "@t" && (string)p.Value! == "default");
    }
}
