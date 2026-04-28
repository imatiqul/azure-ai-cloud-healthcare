using System.Collections.Concurrent;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// W5.6 / W2.6 — process-local registry of in-flight agent planning sessions
/// keyed by sessionId. Lets the <c>POST /api/v1/agents/sessions/{id}/cancel</c>
/// endpoint reach into a running <c>AgentPlanningLoop</c> and trip its
/// <see cref="CancellationToken"/> so the loop exits at the next yield (typically
/// the next LLM call), preserving the partial-answer / GoalMet=false contract
/// already enforced for budget exhaustion.
///
/// Scope is intentionally per-process: clinician-driven cancels are an
/// interactive UX concern, the next request from the same session is going to
/// land on the same pod 99% of the time (sticky session affinity at the APIM
/// + ingress layer), and a missed cancel falls back gracefully to the wall-clock
/// budget timeout. A distributed cancellation broker is a future enhancement
/// when (and only when) the agent fleet starts spanning many pods per session.
/// </summary>
public interface IAgentSessionCancellationRegistry
{
    /// <summary>
    /// Registers a session and returns a <see cref="CancellationTokenSource"/>
    /// linked to <paramref name="inbound"/>. Caller MUST dispose the returned
    /// CTS in a <c>finally</c> so the entry is removed even on faults.
    /// </summary>
    CancellationTokenSource Register(string sessionId, CancellationToken inbound);

    /// <summary>Trips the CTS for <paramref name="sessionId"/> if registered.</summary>
    /// <returns><c>true</c> when a registered session was cancelled.</returns>
    bool TryCancel(string sessionId);
}

public sealed class AgentSessionCancellationRegistry : IAgentSessionCancellationRegistry
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _sessions = new();

    public CancellationTokenSource Register(string sessionId, CancellationToken inbound)
    {
        var linked = CancellationTokenSource.CreateLinkedTokenSource(inbound);
        // Last-writer-wins on duplicate sessionIds. The previous CTS is left
        // un-tripped (its caller still owns the dispose lifecycle) and simply
        // becomes unreachable from the registry, so a subsequent cancel only
        // lands on the new run. This matches the UX expectation that the
        // visible loop is the one the clinician wants to interrupt.
        _sessions[sessionId] = linked;
        return new RegisteredCts(sessionId, linked, _sessions);
    }

    public bool TryCancel(string sessionId)
    {
        if (_sessions.TryGetValue(sessionId, out var cts))
        {
            try
            {
                cts.Cancel();
                return true;
            }
            catch (ObjectDisposedException)
            {
                // Race with normal completion: loop disposed the CTS just before
                // the cancel landed. The inbound user request is therefore
                // already on its way back — treat as "no-op success".
                return false;
            }
        }
        return false;
    }

    /// <summary>
    /// Wrapper CTS that removes itself from the registry on Dispose so a
    /// completed loop never leaves a dangling entry. Subclassing CTS is
    /// awkward (sealed in some runtimes), so we implement this by composition
    /// via a lightweight inner type that shadows the public contract.
    /// </summary>
    private sealed class RegisteredCts : CancellationTokenSource
    {
        private readonly string _sessionId;
        private readonly CancellationTokenSource _inner;
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _registry;

        public RegisteredCts(
            string sessionId,
            CancellationTokenSource inner,
            ConcurrentDictionary<string, CancellationTokenSource> registry)
        {
            _sessionId = sessionId;
            _inner = inner;
            _registry = registry;

            // Mirror the inner CTS into this outer wrapper so the loop's
            // `linked.Token` reflects either an external cancel (via TryCancel
            // on the inner registered CTS) or a direct cancel on this wrapper.
            _inner.Token.Register(() =>
            {
                try { Cancel(); } catch (ObjectDisposedException) { /* benign */ }
            });
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                // Only remove our own entry — guards against last-writer-wins
                // overwriting having already replaced us in the dictionary.
                _registry.TryRemove(new KeyValuePair<string, CancellationTokenSource>(_sessionId, _inner));
                _inner.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
