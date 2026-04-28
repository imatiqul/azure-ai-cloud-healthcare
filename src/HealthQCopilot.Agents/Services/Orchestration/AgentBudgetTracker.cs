using System.Diagnostics;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Options;

namespace HealthQCopilot.Agents.Services.Orchestration;

/// <summary>
/// W2.6 — enforces hard limits on a planning session: max iterations, max
/// total tokens, max wall-clock seconds. Emit <see cref="AgentBudgetSnapshot"/>
/// per check; orchestrators terminate with a partial result on exhaustion
/// (never a 500).
/// </summary>
public sealed class AgentBudgetTracker
{
    private readonly Stopwatch _clock;
    private readonly AgentBudgetOptions _opts;
    private int _iterations;
    private long _tokens;

    public AgentBudgetTracker(IOptions<AgentBudgetOptions> opts)
    {
        _opts = opts.Value;
        _clock = Stopwatch.StartNew();
    }

    public AgentBudgetSnapshot Snapshot() => new(
        Math.Max(0, _opts.MaxIterations - _iterations),
        Math.Max(0, _opts.MaxTotalTokens - _tokens),
        Math.Max(0, _opts.MaxWallClockSeconds - _clock.Elapsed.TotalSeconds));

    public void RecordIteration() => _iterations++;
    public void RecordTokens(long tokens) => _tokens += tokens;

    public bool IsExhausted(out string reason)
    {
        if (_iterations >= _opts.MaxIterations) { reason = "max-iterations"; return true; }
        if (_tokens >= _opts.MaxTotalTokens) { reason = "max-tokens"; return true; }
        if (_clock.Elapsed.TotalSeconds >= _opts.MaxWallClockSeconds) { reason = "max-wall-clock"; return true; }
        reason = string.Empty;
        return false;
    }
}
