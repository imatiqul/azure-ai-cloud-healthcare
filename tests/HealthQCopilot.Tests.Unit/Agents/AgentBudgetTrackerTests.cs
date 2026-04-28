using FluentAssertions;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Options;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W2.6 — guards the AgentPlanningLoop's hard-stop behavior. Three failure
/// dimensions (iterations / total tokens / wall-clock) MUST each independently
/// trip <see cref="AgentBudgetTracker.IsExhausted"/>; orchestrators rely on
/// the reason string to label the planning-loop outcome metric so dashboard
/// breakdowns stay accurate.
/// </summary>
public sealed class AgentBudgetTrackerTests
{
    private static AgentBudgetTracker NewTracker(
        int iters = 100, long tokens = 1_000_000, double seconds = 600)
        => new(Options.Create(new AgentBudgetOptions
        {
            MaxIterations = iters,
            MaxTotalTokens = tokens,
            MaxWallClockSeconds = seconds,
        }));

    [Fact]
    public void Snapshot_starts_at_full_budget()
    {
        var sut = NewTracker(iters: 5, tokens: 10_000, seconds: 30);

        var snap = sut.Snapshot();

        snap.RemainingIterations.Should().Be(5);
        snap.RemainingTokens.Should().Be(10_000);
        snap.RemainingWallClockSeconds.Should().BeLessThanOrEqualTo(30)
            .And.BeGreaterThan(29); // tracker starts its own stopwatch in ctor
    }

    [Fact]
    public void IsExhausted_returns_max_iterations_when_iteration_cap_hit()
    {
        var sut = NewTracker(iters: 2);
        sut.RecordIteration();
        sut.IsExhausted(out _).Should().BeFalse();

        sut.RecordIteration();

        sut.IsExhausted(out var reason).Should().BeTrue();
        reason.Should().Be("max-iterations");
    }

    [Fact]
    public void IsExhausted_returns_max_tokens_when_token_cap_hit()
    {
        var sut = NewTracker(iters: 1000, tokens: 500);
        sut.RecordTokens(499);
        sut.IsExhausted(out _).Should().BeFalse();

        sut.RecordTokens(2);

        sut.IsExhausted(out var reason).Should().BeTrue();
        reason.Should().Be("max-tokens");
    }

    [Fact]
    public void IsExhausted_returns_max_wall_clock_with_zero_budget()
    {
        // Wall-clock budget of 0 trips immediately — guards against
        // misconfiguration shipping an unbounded loop.
        var sut = NewTracker(seconds: 0);

        sut.IsExhausted(out var reason).Should().BeTrue();
        reason.Should().Be("max-wall-clock");
    }

    [Fact]
    public void Snapshot_reflects_recorded_consumption()
    {
        var sut = NewTracker(iters: 5, tokens: 1000);
        sut.RecordIteration();
        sut.RecordIteration();
        sut.RecordTokens(250);

        var snap = sut.Snapshot();

        snap.RemainingIterations.Should().Be(3);
        snap.RemainingTokens.Should().Be(750);
    }
}
