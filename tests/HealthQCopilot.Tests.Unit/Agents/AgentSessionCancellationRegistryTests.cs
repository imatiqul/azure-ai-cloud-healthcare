using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W5.6 — process-local cancellation registry that lets the cancel endpoint
/// reach into a running planning loop. Pins the contract:
///   - Register returns a CTS that observes both inbound + external cancel
///   - TryCancel trips a registered session, returns true once
///   - Disposing the returned CTS removes the registry entry so a follow-up
///     TryCancel becomes a no-op (no false positives, no leak)
///   - Last-writer-wins on duplicate sessionIds
/// </summary>
public sealed class AgentSessionCancellationRegistryTests
{
    private readonly AgentSessionCancellationRegistry _sut = new();

    [Fact]
    public void TryCancel_returns_false_when_session_unknown()
    {
        _sut.TryCancel("does-not-exist").Should().BeFalse();
    }

    [Fact]
    public void TryCancel_trips_the_token_for_a_registered_session()
    {
        using var cts = _sut.Register("s1", TestContext.Current.CancellationToken);

        var ok = _sut.TryCancel("s1");

        ok.Should().BeTrue();
        cts.Token.IsCancellationRequested.Should().BeTrue();
    }

    [Fact]
    public void Inbound_cancel_propagates_into_the_linked_token()
    {
        using var inbound = new CancellationTokenSource();
        using var cts = _sut.Register("s1", inbound.Token);

        inbound.Cancel();

        cts.Token.IsCancellationRequested.Should().BeTrue();
    }

    [Fact]
    public void Disposing_the_returned_cts_removes_the_registry_entry()
    {
        var cts = _sut.Register("s1", TestContext.Current.CancellationToken);
        cts.Dispose();

        // Subsequent cancel should not find the session — it was un-registered
        // when the loop disposed its CTS in the finally block.
        _sut.TryCancel("s1").Should().BeFalse();
    }

    [Fact]
    public void Last_writer_wins_on_duplicate_session_ids()
    {
        using var first  = _sut.Register("s1", TestContext.Current.CancellationToken);
        using var second = _sut.Register("s1", TestContext.Current.CancellationToken);

        _sut.TryCancel("s1").Should().BeTrue();

        // The most recent registration is the one the cancel landed on
        second.Token.IsCancellationRequested.Should().BeTrue();
        first.Token.IsCancellationRequested.Should().BeFalse();
    }
}
