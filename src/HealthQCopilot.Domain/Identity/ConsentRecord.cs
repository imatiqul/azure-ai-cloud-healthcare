using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Identity;

/// <summary>
/// HIPAA §164.508 / GDPR Art. 7 patient consent record.
///
/// Captures the patient's consent for a specific purpose of data use,
/// with a validity window and revocation capability.
/// Scoped to a data subject (patient) identified by their UserAccount Id.
/// </summary>
public sealed class ConsentRecord : AggregateRoot<Guid>
{
    /// <summary>The UserId of the patient giving consent.</summary>
    public Guid PatientUserId { get; private set; }

    /// <summary>
    /// Purpose of data processing (e.g. "treatment", "research", "marketing",
    /// "payer-data-exchange", "population-health").
    /// Maps to FHIR Consent.provision.purpose.
    /// </summary>
    public string Purpose { get; private set; } = string.Empty;

    /// <summary>
    /// Scope of the consent (e.g. "phi-read", "phi-write", "phi-share-payer",
    /// "phi-share-research", "dsa-export").
    /// </summary>
    public string Scope { get; private set; } = string.Empty;

    /// <summary>Consent status.</summary>
    public ConsentStatus Status { get; private set; } = ConsentStatus.Active;

    /// <summary>ISO 3166-1 alpha-2 jurisdiction for GDPR or provincial law applicability.</summary>
    public string? JurisdictionCode { get; private set; }

    /// <summary>Timestamp when the patient granted consent.</summary>
    public DateTime GrantedAt { get; private set; }

    /// <summary>Consent validity expiry (null = indefinite, typical for HIPAA treatment).</summary>
    public DateTime? ExpiresAt { get; private set; }

    /// <summary>Timestamp when the patient revoked consent (null if not revoked).</summary>
    public DateTime? RevokedAt { get; private set; }

    /// <summary>Free-text reason for revocation.</summary>
    public string? RevocationReason { get; private set; }

    /// <summary>IP address or source identifier of the consent grant event.</summary>
    public string? GrantedByIp { get; private set; }

    /// <summary>Version of the privacy policy / consent form shown to the patient.</summary>
    public string PolicyVersion { get; private set; } = string.Empty;

    private ConsentRecord() { }

    public static ConsentRecord Grant(
        Guid patientUserId,
        string purpose,
        string scope,
        string policyVersion,
        DateTime? expiresAt = null,
        string? jurisdictionCode = null,
        string? grantedByIp = null)
    {
        var consent = new ConsentRecord
        {
            Id = Guid.NewGuid(),
            PatientUserId = patientUserId,
            Purpose = purpose,
            Scope = scope,
            Status = ConsentStatus.Active,
            PolicyVersion = policyVersion,
            GrantedAt = DateTime.UtcNow,
            ExpiresAt = expiresAt,
            JurisdictionCode = jurisdictionCode,
            GrantedByIp = grantedByIp,
        };
        consent.RaiseDomainEvent(new ConsentGranted(consent.Id, patientUserId, purpose, scope));
        return consent;
    }

    public Result Revoke(string? reason = null)
    {
        if (Status == ConsentStatus.Revoked)
            return Result.Failure("Consent is already revoked.");

        Status = ConsentStatus.Revoked;
        RevokedAt = DateTime.UtcNow;
        RevocationReason = reason;
        RaiseDomainEvent(new ConsentRevoked(Id, PatientUserId, Purpose, reason));
        return Result.Success();
    }

    public bool IsActive() =>
        Status == ConsentStatus.Active
        && (ExpiresAt is null || ExpiresAt > DateTime.UtcNow);
}

public enum ConsentStatus { Active, Revoked, Expired }

// ── Domain Events ─────────────────────────────────────────────────────────────

public sealed record ConsentGranted(
    Guid ConsentId,
    Guid PatientUserId,
    string Purpose,
    string Scope) : DomainEvent;

public sealed record ConsentRevoked(
    Guid ConsentId,
    Guid PatientUserId,
    string Purpose,
    string? Reason) : DomainEvent;
