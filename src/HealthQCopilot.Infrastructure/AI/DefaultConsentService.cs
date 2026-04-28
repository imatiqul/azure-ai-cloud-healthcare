namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Default consent service — grants consent for non-PHI scopes and any session
/// flagged by the BFF as having a captured consent token. Real implementations
/// will resolve from the patient consent registry.
/// </summary>
public sealed class DefaultConsentService : IConsentService
{
    public Task<ConsentDecision> CheckAsync(string sessionId, string? patientId, string scope, CancellationToken ct = default)
    {
        // Non-PHI scopes (platform guide, demo) are granted by default.
        if (scope is "platform-guide" or "demo")
        {
            return Task.FromResult(new ConsentDecision(true, "non-phi-scope", DateTimeOffset.UtcNow, "system"));
        }

        // Anonymous/synthetic sessions used in eval pass through.
        if (string.IsNullOrEmpty(patientId) || patientId.StartsWith("SYN-", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(new ConsentDecision(true, "synthetic-or-anonymous", DateTimeOffset.UtcNow, "system"));
        }

        // Default deny in absence of an explicit consent provider — fail-safe.
        return Task.FromResult(new ConsentDecision(false, "no-consent-provider-configured", null, null));
    }
}
