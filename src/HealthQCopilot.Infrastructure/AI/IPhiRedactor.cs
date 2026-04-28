using HealthQCopilot.Domain.Agents.Contracts;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Masks Protected Health Information (PHI) in free-text before it leaves the
/// process for an external LLM endpoint. Implementations must be deterministic
/// per session and produce a reversible <see cref="RedactionResult.TokenMap"/>
/// so model output can be re-hydrated for clinician display.
/// HIPAA: this is the primary technical safeguard (45 CFR § 164.312(a)(1)).
/// </summary>
public interface IPhiRedactor
{
    Task<RedactionResult> RedactAsync(string input, string sessionId, CancellationToken ct = default);

    /// <summary>
    /// Reverses redaction on output text using the token map produced by a prior
    /// <see cref="RedactAsync"/> call. Tokens not in the map are left unchanged.
    /// </summary>
    string Rehydrate(string redactedOutput, IReadOnlyDictionary<string, string> tokenMap);
}
