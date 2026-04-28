using System.Diagnostics.Metrics;
using FluentAssertions;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// P4.2 — verifies that <see cref="AgentHandoffCoordinator.HandoffAsync"/>
/// emits <c>agent_handoff_depth</c> histogram measurements with the correct
/// cumulative depth value and from_agent/to_agent tags.
/// </summary>
public sealed class AgentHandoffCoordinatorTests
{
    private readonly IAgentRouter _router = Substitute.For<IAgentRouter>();
    private readonly IAgentTraceRecorder _trace = Substitute.For<IAgentTraceRecorder>();
    private readonly BusinessMetrics _metrics =
        new(new ServiceCollection().AddMetrics().BuildServiceProvider()
            .GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());

    // ── helpers ───────────────────────────────────────────────────────────────

    private AgentHandoffCoordinator CreateSut() =>
        new(_router, _trace, _metrics, NullLogger<AgentHandoffCoordinator>.Instance);

    private void ConfigureRoute(string from, string to, double conf = 0.8) =>
        _router.RouteAsync(from, Arg.Any<string>(), Arg.Any<double>(),
            Arg.Any<IReadOnlyDictionary<string, string>>(), Arg.Any<CancellationToken>())
            .Returns(new AgentRoutingDecision(to, "unit test", conf, TerminateLoop: false));

    private List<(int Value, string FromAgent, string ToAgent)> CaptureHandoffDepth()
    {
        var captured = new List<(int, string, string)>();
        var listener = new MeterListener
        {
            InstrumentPublished = (instrument, l) =>
            {
                if (instrument.Name == "agent_handoff_depth")
                    l.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<int>((_, val, tags, _) =>
        {
            string from = "", to = "";
            for (var i = 0; i < tags.Length; i++)
            {
                if (tags[i].Key == "from_agent") from = tags[i].Value?.ToString() ?? "";
                if (tags[i].Key == "to_agent")   to   = tags[i].Value?.ToString() ?? "";
            }
            captured.Add((val, from, to));
        });
        listener.Start();
        return captured;
    }

    private static AgentBudgetSnapshot Budget() => new(RemainingIterations: 9, RemainingTokens: 4000, RemainingWallClockSeconds: 25);

    // ── tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task HandoffAsync_emits_depth_1_on_first_handoff()
    {
        // Use a unique sessionId per test to avoid cross-test static-dict pollution
        var sessionId = $"s-depth-{Guid.NewGuid():n}";
        ConfigureRoute("TriageAgent", "ClinicalCoderAgent");
        var captured = CaptureHandoffDepth();
        var sut = CreateSut();

        await sut.HandoffAsync(sessionId, "tenant-a", "TriageAgent", "code the triage",
            0.75, new Dictionary<string, string>(), Array.Empty<RagCitation>(), Budget());

        captured.Should().ContainSingle(
            because: "first handoff in the session should record depth=1");
        var (depth, fromAgent, toAgent) = captured[0];
        depth.Should().Be(1);
        fromAgent.Should().Be("TriageAgent");
        toAgent.Should().Be("ClinicalCoderAgent");
    }

    [Fact]
    public async Task HandoffAsync_emits_incrementing_depth_across_sequential_handoffs()
    {
        var sessionId = $"s-depth-{Guid.NewGuid():n}";
        // First hop: Triage -> Coder
        ConfigureRoute("TriageAgent", "ClinicalCoderAgent");
        var captured = CaptureHandoffDepth();
        var sut = CreateSut();

        await sut.HandoffAsync(sessionId, "tenant-a", "TriageAgent", "code the triage",
            0.75, new Dictionary<string, string>(), Array.Empty<RagCitation>(), Budget());

        // Second hop: Coder -> GuideAgent — reconfigure the router stub
        _router.RouteAsync("ClinicalCoderAgent", Arg.Any<string>(), Arg.Any<double>(),
            Arg.Any<IReadOnlyDictionary<string, string>>(), Arg.Any<CancellationToken>())
            .Returns(new AgentRoutingDecision("GuideAgent", "follow-up query", 0.6, TerminateLoop: false));

        await sut.HandoffAsync(sessionId, "tenant-a", "ClinicalCoderAgent", "explain the codes",
            0.6, new Dictionary<string, string>(), Array.Empty<RagCitation>(), Budget());

        captured.Should().HaveCount(2);
        captured[0].Value.Should().Be(1, because: "first hop is depth 1");
        captured[1].Value.Should().Be(2, because: "second hop in same session is depth 2");
    }

    [Fact]
    public async Task HandoffAsync_depth_is_independent_per_session()
    {
        var sessionA = $"s-depth-{Guid.NewGuid():n}";
        var sessionB = $"s-depth-{Guid.NewGuid():n}";
        ConfigureRoute("TriageAgent", "ClinicalCoderAgent");
        var captured = CaptureHandoffDepth();
        var sut = CreateSut();

        // One handoff each in two independent sessions
        await sut.HandoffAsync(sessionA, "tenant-a", "TriageAgent", "triage A",
            0.8, new Dictionary<string, string>(), Array.Empty<RagCitation>(), Budget());
        await sut.HandoffAsync(sessionB, "tenant-b", "TriageAgent", "triage B",
            0.8, new Dictionary<string, string>(), Array.Empty<RagCitation>(), Budget());

        captured.Should().HaveCount(2);
        captured.Should().AllSatisfy(m => m.Value.Should().Be(1,
            because: "each session's first handoff must be depth 1 regardless of other sessions"));
    }
}
