using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Caching;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W4.5 — verifies the Cosmos-backed <see cref="IPromptRegistry"/> resolves
/// tenant overrides and platform defaults from Cosmos, falls back to the inner
/// registry on miss / failure, and never propagates Cosmos exceptions.
/// </summary>
public sealed class CosmosPromptRegistryTests
{
    private readonly Container _container = Substitute.For<Container>();
    private readonly IPromptRegistry _inner = Substitute.For<IPromptRegistry>();
    private readonly ICacheService _cache = Substitute.For<ICacheService>();

    public CosmosPromptRegistryTests()
    {
        _cache.GetAsync<string>(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns((string?)null);
    }

    [Fact]
    public async Task Returns_tenant_specific_doc_from_cosmos()
    {
        StubQuery("triage-system", "tenant-a", new[] {
            Doc("triage-system", "tenant-a", 3, "TENANT BODY"),
        });
        StubEmpty("triage-system", "default");
        var sut = CreateSut();

        var result = await sut.GetPromptAsync("triage-system", "tenant-a", "HARDCODED");

        result.Should().Be("TENANT BODY");
        await _inner.DidNotReceive().GetPromptAsync(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _cache.Received(1).SetAsync("prompt:tenant-a:triage-system", "TENANT BODY",
            Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Falls_back_to_default_partition_when_tenant_missing()
    {
        StubEmpty("triage-system", "tenant-a");
        StubQuery("triage-system", "default", new[] {
            Doc("triage-system", "default", 1, "DEFAULT BODY"),
        });
        var sut = CreateSut();

        var result = await sut.GetPromptAsync("triage-system", "tenant-a", "HARDCODED");

        result.Should().Be("DEFAULT BODY");
        await _inner.DidNotReceive().GetPromptAsync(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Falls_back_to_inner_registry_on_complete_miss()
    {
        StubEmpty("triage-system", "tenant-a");
        StubEmpty("triage-system", "default");
        _inner.GetPromptAsync("triage-system", "tenant-a", "HARDCODED", Arg.Any<CancellationToken>())
            .Returns("INNER RESULT");
        var sut = CreateSut();

        var result = await sut.GetPromptAsync("triage-system", "tenant-a", "HARDCODED");

        result.Should().Be("INNER RESULT");
    }

    [Fact]
    public async Task Falls_back_to_inner_registry_on_cosmos_failure()
    {
        var failingIterator = Substitute.For<FeedIterator<CosmosPromptRegistry.PromptDocument>>();
        failingIterator.HasMoreResults.Returns(true);
        failingIterator.ReadNextAsync(Arg.Any<CancellationToken>())
            .Throws(new CosmosException("boom", System.Net.HttpStatusCode.ServiceUnavailable, 0, "x", 0));
        _container.GetItemQueryIterator<CosmosPromptRegistry.PromptDocument>(
                Arg.Any<QueryDefinition>(),
                Arg.Any<string?>(),
                Arg.Any<QueryRequestOptions?>())
            .Returns(failingIterator);
        _inner.GetPromptAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns("FALLBACK");
        var sut = CreateSut();

        var result = await sut.GetPromptAsync("triage-system", "tenant-a", "HARDCODED");

        result.Should().Be("FALLBACK");
    }

    [Fact]
    public async Task UpsertPromptAsync_writes_doc_and_invalidates_caches()
    {
        var sut = CreateSut();

        await sut.UpsertPromptAsync("triage-system", "tenant-a", 5, "NEW BODY", environment: "prod");

        await _container.Received(1).UpsertItemAsync(
            Arg.Is<CosmosPromptRegistry.PromptDocument>(d =>
                d.id == "triage-system:tenant-a:5" &&
                d.promptKey == "triage-system" &&
                d.version == 5 &&
                d.body == "NEW BODY" &&
                d.environment == "prod" &&
                d.active == true),
            Arg.Is<PartitionKey>(p => p == new PartitionKey("triage-system")),
            Arg.Any<ItemRequestOptions?>(),
            Arg.Any<CancellationToken>());
        await _cache.Received(1).RemoveAsync("prompt:tenant-a:triage-system", Arg.Any<CancellationToken>());
        await _cache.Received(1).RemoveAsync("prompt:default:triage-system", Arg.Any<CancellationToken>());
    }

    private CosmosPromptRegistry CreateSut() => new(
        _container, _inner, _cache, NullLogger<CosmosPromptRegistry>.Instance);

    private void StubQuery(string promptKey, string tenantId, IEnumerable<CosmosPromptRegistry.PromptDocument> docs)
    {
        var iterator = Substitute.For<FeedIterator<CosmosPromptRegistry.PromptDocument>>();
        var calls = 0;
        iterator.HasMoreResults.Returns(_ => calls++ == 0);
        var feed = Substitute.For<FeedResponse<CosmosPromptRegistry.PromptDocument>>();
        feed.GetEnumerator().Returns(_ => docs.GetEnumerator());
        iterator.ReadNextAsync(Arg.Any<CancellationToken>()).Returns(feed);
        _container.GetItemQueryIterator<CosmosPromptRegistry.PromptDocument>(
                Arg.Is<QueryDefinition>(q => MatchesParams(q, promptKey, tenantId)),
                Arg.Any<string?>(),
                Arg.Any<QueryRequestOptions?>())
            .Returns(iterator);
    }

    private void StubEmpty(string promptKey, string tenantId) =>
        StubQuery(promptKey, tenantId, Array.Empty<CosmosPromptRegistry.PromptDocument>());

    private static bool MatchesParams(QueryDefinition q, string promptKey, string tenantId)
    {
        var ps = q.GetQueryParameters();
        return ps.Any(p => p.Name == "@k" && (string)p.Value! == promptKey)
            && ps.Any(p => p.Name == "@t" && (string)p.Value! == tenantId);
    }

    private static CosmosPromptRegistry.PromptDocument Doc(
        string promptKey, string tenantId, int version, string body) =>
        new(
            id: $"{promptKey}:{tenantId}:{version}",
            promptKey: promptKey,
            tenantId: tenantId,
            version: version,
            body: body,
            environment: null,
            active: true,
            updatedAt: DateTimeOffset.UtcNow);
}
