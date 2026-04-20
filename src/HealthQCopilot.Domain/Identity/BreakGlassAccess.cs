using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Identity;

/// <summary>
/// HIPAA §164.312(a)(2)(ii) "Emergency access procedure" — break-glass access record.
///
/// Allows a clinician to override consent/access controls in an emergency.
/// All access is time-limited, audit-logged, and triggers a supervisor notification.
/// Each break-glass grant is valid for a configurable window (default 4 hours).
/// After expiry or revocation the record is kept as an immutable audit trail.
/// </summary>
public sealed class BreakGlassAccess : AggregateRoot<Guid>
{
    /// <summary>UserId of the clinician requesting break-glass access.</summary>
    public Guid RequestedByUserId { get; private set; }

    /// <summary>
    /// FHIR Patient ID or UserAccount Id of the patient whose record is being accessed.
    /// </summary>
    public string TargetPatientId { get; private set; } = string.Empty;

    /// <summary>
    /// The clinician must provide a clinical justification (free-text, up to 1000 chars).
    /// Stored immutably for the audit record.
    /// </summary>
    public string ClinicalJustification { get; private set; } = string.Empty;

    /// <summary>Current access status.</summary>
    public BreakGlassStatus Status { get; private set; }

    /// <summary>Timestamp when break-glass was granted.</summary>
    public DateTime GrantedAt { get; private set; }

    /// <summary>Time-limited expiry (default: 4 hours from grant).</summary>
    public DateTime ExpiresAt { get; private set; }

    /// <summary>UserId of the supervisor who revoked access (null if not revoked).</summary>
    public Guid? RevokedByUserId { get; private set; }

    /// <summary>Timestamp of revocation.</summary>
    public DateTime? RevokedAt { get; private set; }

    /// <summary>Reason for supervisor revocation.</summary>
    public string? RevocationReason { get; private set; }

    private BreakGlassAccess() { }

    /// <summary>
    /// Create a new break-glass access request.
    /// Break-glass access is immediately Active (no supervisor pre-approval needed)
    /// but all access is audit-logged and supervisors are notified asynchronously.
    /// </summary>
    public static BreakGlassAccess Create(
        Guid requestedByUserId,
        string targetPatientId,
        string clinicalJustification,
        TimeSpan? validFor = null)
    {
        if (string.IsNullOrWhiteSpace(clinicalJustification))
            throw new ArgumentException("Clinical justification is required for break-glass access.", nameof(clinicalJustification));

        var grantedAt = DateTime.UtcNow;
        var expiresAt = grantedAt + (validFor ?? TimeSpan.FromHours(4));

        var access = new BreakGlassAccess
        {
            Id = Guid.NewGuid(),
            RequestedByUserId = requestedByUserId,
            TargetPatientId = targetPatientId,
            ClinicalJustification = clinicalJustification,
            Status = BreakGlassStatus.Active,
            GrantedAt = grantedAt,
            ExpiresAt = expiresAt,
        };

        access.RaiseDomainEvent(new BreakGlassAccessGranted(
            access.Id, requestedByUserId, targetPatientId, clinicalJustification, expiresAt));
        return access;
    }

    /// <summary>Check if this break-glass session is still within its valid window.</summary>
    public bool IsValid() => Status == BreakGlassStatus.Active && DateTime.UtcNow < ExpiresAt;

    /// <summary>Supervisor revocation of an active break-glass session.</summary>
    public Result Revoke(Guid revokedByUserId, string? reason = null)
    {
        if (Status == BreakGlassStatus.Revoked) return Result.Failure("Access already revoked.");
        if (Status == BreakGlassStatus.Expired)  return Result.Failure("Access already expired.");

        Status = BreakGlassStatus.Revoked;
        RevokedByUserId = revokedByUserId;
        RevokedAt = DateTime.UtcNow;
        RevocationReason = reason;

        RaiseDomainEvent(new BreakGlassAccessRevoked(Id, RequestedByUserId, TargetPatientId, revokedByUserId));
        return Result.Success();
    }

    /// <summary>Mark an expired session. Called by background expiry sweep.</summary>
    public void MarkExpired()
    {
        if (Status != BreakGlassStatus.Active) return;
        Status = BreakGlassStatus.Expired;
    }
}

public enum BreakGlassStatus { Active, Expired, Revoked }

// ── Domain Events ─────────────────────────────────────────────────────────────

public sealed record BreakGlassAccessGranted(
    Guid AccessId,
    Guid RequestedByUserId,
    string TargetPatientId,
    string ClinicalJustification,
    DateTime ExpiresAt) : DomainEvent;

public sealed record BreakGlassAccessRevoked(
    Guid AccessId,
    Guid RequestedByUserId,
    string TargetPatientId,
    Guid RevokedByUserId) : DomainEvent;
