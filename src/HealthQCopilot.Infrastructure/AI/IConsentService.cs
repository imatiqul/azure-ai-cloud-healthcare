namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Resolves whether a patient/session has provided informed consent for an
/// AI-assisted workflow. Required before invoking any LLM agent path when the
/// <c>HealthQ:PatientConsentGate</c> feature is enabled.
/// </summary>
public interface IConsentService
{
    Task<ConsentDecision> CheckAsync(string sessionId, string? patientId, string scope, CancellationToken ct = default);
}

public sealed record ConsentDecision(
    bool Granted,
    string? Reason,
    DateTimeOffset? GrantedAt,
    string? GrantedBy);
