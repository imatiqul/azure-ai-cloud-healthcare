using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Runs the clinical evaluation harness over a curated golden set and emits an
/// <see cref="EvalReport"/>. Used by both the CI gate (<c>agent-eval.yml</c>)
/// and scheduled production groundedness sampling.
/// </summary>
public interface IClinicalEvaluator
{
    Task<EvalReport> EvaluateAsync(string suite, CancellationToken ct = default);
}
