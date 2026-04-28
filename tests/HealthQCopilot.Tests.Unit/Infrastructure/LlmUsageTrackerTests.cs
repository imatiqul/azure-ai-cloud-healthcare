using System.Diagnostics.Metrics;
using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W4.2 — verifies <see cref="LlmUsageTracker"/> emits the new
/// <c>agent_llm_cost_usd_total</c> counter with the expected agent / tenant /
/// model tags, and stays silent when the estimated cost is zero (so streaming /
/// mock-LLM paths don't pollute the cost dashboard with phantom rows).
/// </summary>
public sealed class LlmUsageTrackerTests
{
    private readonly BusinessMetrics _metrics;
    private readonly LlmUsageTracker _sut;

    public LlmUsageTrackerTests()
    {
        var sp = new ServiceCollection().AddMetrics().BuildServiceProvider();
        _metrics = new BusinessMetrics(sp.GetRequiredService<IMeterFactory>());
        _sut = new LlmUsageTracker(_metrics);
    }

    [Fact]
    public void TrackUsage_emits_cost_counter_when_estimated_cost_is_positive()
    {
        var captured = CaptureCounter("agent_llm_cost_usd_total");

        _sut.TrackUsage(
            promptTokens: 100,
            completionTokens: 50,
            agentName: "TriageAgent",
            tenantId: "tenant-a",
            latencyMs: 120,
            estimatedCostUsd: 0.0042m,
            modelId: "gpt-4o-mini");

        captured.Should().HaveCount(1);
        captured[0].Value.Should().BeApproximately(0.0042, 1e-9);
        captured[0].Tags.Should().Contain(("agent", "TriageAgent"));
        captured[0].Tags.Should().Contain(("tenant", "tenant-a"));
        captured[0].Tags.Should().Contain(("model", "gpt-4o-mini"));
    }

    [Fact]
    public void TrackUsage_skips_cost_counter_when_estimated_cost_is_zero()
    {
        var captured = CaptureCounter("agent_llm_cost_usd_total");

        _sut.TrackUsage(
            promptTokens: 100,
            completionTokens: 50,
            agentName: "TriageAgent",
            tenantId: "tenant-a",
            latencyMs: 120);

        captured.Should().BeEmpty();
    }

    [Fact]
    public void TrackUsage_uses_unknown_model_tag_when_modelId_omitted()
    {
        var captured = CaptureCounter("agent_llm_cost_usd_total");

        _sut.TrackUsage(
            promptTokens: 1, completionTokens: 1,
            agentName: "GuideAgent", tenantId: "tenant-b",
            latencyMs: 1, estimatedCostUsd: 0.01m);

        captured.Should().ContainSingle();
        captured[0].Tags.Should().Contain(("model", "unknown"));
    }

    private List<(double Value, IReadOnlyList<(string Key, object? Value)> Tags)> CaptureCounter(string name)
    {
        var captured = new List<(double, IReadOnlyList<(string, object?)>)>();
        var listener = new MeterListener
        {
            InstrumentPublished = (instrument, l) =>
            {
                if (instrument.Name == name) l.EnableMeasurementEvents(instrument);
            },
        };
        listener.SetMeasurementEventCallback<double>((inst, val, tags, _) =>
        {
            var copy = new List<(string, object?)>();
            for (var i = 0; i < tags.Length; i++)
                copy.Add((tags[i].Key, tags[i].Value));
            captured.Add((val, copy));
        });
        listener.Start();
        return captured;
    }
}
