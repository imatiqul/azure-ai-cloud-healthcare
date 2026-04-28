namespace HealthQCopilot.Agents.Prompts;

/// <summary>
/// W4.5 — versioned agent prompt registry. Distinct from the multi-tenant
/// <c>HealthQCopilot.Infrastructure.AI.IPromptRegistry</c> (which resolves
/// per-tenant overrides at request time): this one ships the canonical
/// agent system prompts together with a stable id/version pair so each audit
/// + trace record can be tied back to the exact prompt revision that produced
/// it. The default in-memory implementation seeds v1 prompts byte-identically
/// to the strings previously hard-coded in agents; a Cosmos-backed
/// implementation will replace it via the same interface.
/// </summary>
public interface IAgentPromptRegistry
{
    /// <summary>
    /// Returns the active prompt for <paramref name="promptId"/>. Throws
    /// <see cref="KeyNotFoundException"/> if the id is not registered, so missing
    /// prompts surface loudly during startup integration tests rather than
    /// silently degrading to an empty system message in production.
    /// </summary>
    PromptDefinition Get(string promptId);

    /// <summary>Returns true if <paramref name="promptId"/> is registered.</summary>
    bool TryGet(string promptId, out PromptDefinition definition);
}

/// <summary>
/// Immutable prompt record. <see cref="Version"/> uses semantic-style strings
/// (e.g. <c>"1.0"</c>, <c>"1.1-experiment-shorter"</c>) rather than ints so we
/// can ship variants alongside a baseline without renumbering.
/// </summary>
public sealed record PromptDefinition(string Id, string Version, string Template);
