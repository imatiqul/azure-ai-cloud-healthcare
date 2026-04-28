using FluentAssertions;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W4.1 — verifies the Cosmos-backed <see cref="ITokenLedger"/> persists records,
/// keeps emitting OTel/App Insights metrics via <see cref="ILlmUsageTracker"/>,
/// and never propagates Cosmos exceptions into the request path.
/// </summary>
public sealed class CosmosTokenLedgerTests
{
    private readonly Container _container = Substitute.For<Container>();
    private readonly ILlmUsageTracker _usage = Substitute.For<ILlmUsageTracker>();
    private readonly IOptions<CosmosOptions> _options =
        Options.Create(new CosmosOptions { TokenLedgerTtlSeconds = 60 });

    [Fact]
    public async Task RecordAsync_persists_document_and_emits_metric()
    {
        var sut = CreateSut();
        var record = SampleRecord();

        await sut.RecordAsync(record);

        _usage.Received(1).TrackUsage(
            record.PromptTokens,
            record.CompletionTokens,
            record.AgentName,
            record.TenantId,
            record.LatencyMs,
            estimatedCostUsd: record.EstimatedCostUsd,
            modelId: record.ModelId);
        await _container.Received(1).CreateItemAsync(
            Arg.Is<CosmosTokenLedger.TokenUsageDocument>(d =>
                d.sessionId == record.SessionId &&
                d.promptTokens == record.PromptTokens &&
                d.completionTokens == record.CompletionTokens &&
                d.totalTokens == record.TotalTokens &&
                d.ttl == 60),
            Arg.Is<PartitionKey>(p => p == new PartitionKey(record.SessionId)),
            Arg.Any<ItemRequestOptions?>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RecordAsync_swallows_cosmos_failures()
    {
        _container.CreateItemAsync(
                Arg.Any<CosmosTokenLedger.TokenUsageDocument>(),
                Arg.Any<PartitionKey?>(),
                Arg.Any<ItemRequestOptions?>(),
                Arg.Any<CancellationToken>())
            .Throws(new CosmosException("boom", System.Net.HttpStatusCode.ServiceUnavailable, 0, "x", 0));
        var sut = CreateSut();

        var act = async () => await sut.RecordAsync(SampleRecord());

        await act.Should().NotThrowAsync();
        _usage.Received(1).TrackUsage(
            Arg.Any<int>(),
            Arg.Any<int>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<double>(),
            Arg.Any<decimal>(),
            Arg.Any<string?>());
    }

    private CosmosTokenLedger CreateSut() => new(
        _container, _usage, _options, NullLogger<CosmosTokenLedger>.Instance);

    private static TokenUsageRecord SampleRecord() => new(
        SessionId: "s1",
        TenantId: "t1",
        AgentName: "TriageAgent",
        ModelId: "gpt-4o",
        DeploymentName: "gpt-4o",
        PromptId: null,
        PromptVersion: null,
        PromptTokens: 12,
        CompletionTokens: 8,
        TotalTokens: 20,
        EstimatedCostUsd: 0m,
        LatencyMs: 123.4,
        CapturedAt: DateTimeOffset.UtcNow);
}
