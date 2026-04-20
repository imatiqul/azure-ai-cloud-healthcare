using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.RevenueCycle;

/// <summary>
/// Represents an EDI 837P / 837I professional or institutional claim submission
/// sent to a clearinghouse on behalf of a patient/encounter.
///
/// The EDI payload itself is stored separately (object store / KV); this entity
/// tracks lifecycle state and cross-references back to the coding job.
/// </summary>
public sealed class ClaimSubmission : AggregateRoot<Guid>
{
    public Guid CodingJobId { get; private set; }
    public string PatientId { get; private set; } = default!;
    public string PatientName { get; private set; } = default!;
    public string EncounterId { get; private set; } = default!;
    public string InsurancePayer { get; private set; } = default!;
    public List<string> DiagnosisCodes { get; private set; } = [];
    public ClaimType ClaimType { get; private set; }
    public ClaimSubmissionStatus Status { get; private set; }

    /// <summary>Clearinghouse-assigned claim control number after acknowledgement.</summary>
    public string? ClearinghouseClaimId { get; private set; }

    /// <summary>Total billed amount in cents (USD) to avoid decimal rounding.</summary>
    public long TotalChargesCents { get; private set; }

    /// <summary>EDI interchange control number (ISA13) — unique per transmission.</summary>
    public string InterchangeControlNumber { get; private set; } = default!;

    public DateTime CreatedAt { get; private set; }
    public DateTime? SubmittedAt { get; private set; }
    public DateTime? AcknowledgedAt { get; private set; }
    public string? RejectionReason { get; private set; }

    private ClaimSubmission() { }

    public static ClaimSubmission Create(
        Guid codingJobId,
        string patientId,
        string patientName,
        string encounterId,
        string insurancePayer,
        List<string> diagnosisCodes,
        long totalChargesCents,
        ClaimType claimType = ClaimType.Professional)
    {
        var claim = new ClaimSubmission
        {
            Id = Guid.NewGuid(),
            CodingJobId = codingJobId,
            PatientId = patientId,
            PatientName = patientName,
            EncounterId = encounterId,
            InsurancePayer = insurancePayer,
            DiagnosisCodes = diagnosisCodes,
            TotalChargesCents = totalChargesCents,
            ClaimType = claimType,
            Status = ClaimSubmissionStatus.Pending,
            InterchangeControlNumber = GenerateIcn(),
            CreatedAt = DateTime.UtcNow,
        };
        claim.RaiseDomainEvent(new ClaimCreated(claim.Id, codingJobId, patientId));
        return claim;
    }

    /// <summary>Mark as sent to clearinghouse — transitions Pending → Submitted.</summary>
    public Result Submit()
    {
        if (Status != ClaimSubmissionStatus.Pending)
            return Result.Failure($"Cannot submit a claim in {Status} state.");
        Status = ClaimSubmissionStatus.Submitted;
        SubmittedAt = DateTime.UtcNow;
        RaiseDomainEvent(new ClaimSubmitted(Id, PatientId, InsurancePayer));
        return Result.Success();
    }

    /// <summary>Clearinghouse accepted the claim (999/TA1 acknowledgement).</summary>
    public Result Acknowledge(string clearinghouseClaimId)
    {
        if (Status != ClaimSubmissionStatus.Submitted)
            return Result.Failure($"Cannot acknowledge a claim in {Status} state.");
        Status = ClaimSubmissionStatus.Acknowledged;
        ClearinghouseClaimId = clearinghouseClaimId;
        AcknowledgedAt = DateTime.UtcNow;
        RaiseDomainEvent(new ClaimAcknowledged(Id, clearinghouseClaimId));
        return Result.Success();
    }

    /// <summary>Clearinghouse rejected the claim (999 with AK5*R).</summary>
    public Result Reject(string reason)
    {
        if (Status is not (ClaimSubmissionStatus.Submitted or ClaimSubmissionStatus.Pending))
            return Result.Failure($"Cannot reject a claim in {Status} state.");
        Status = ClaimSubmissionStatus.Rejected;
        RejectionReason = reason;
        RaiseDomainEvent(new ClaimRejected(Id, reason));
        return Result.Success();
    }

    private static string GenerateIcn()
    {
        // 9-digit ICN per ISA13 spec: right-justified, zero-padded
        var n = (DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond) % 1_000_000_000L;
        return n.ToString("D9");
    }
}

public enum ClaimType { Professional, Institutional }

public enum ClaimSubmissionStatus
{
    Pending,
    Submitted,
    Acknowledged,
    Rejected,
    Paid,
    Denied,
}

// ── Domain Events ────────────────────────────────────────────────────────────
public sealed record ClaimCreated(Guid ClaimId, Guid CodingJobId, string PatientId) : DomainEvent;
public sealed record ClaimSubmitted(Guid ClaimId, string PatientId, string Payer) : DomainEvent;
public sealed record ClaimAcknowledged(Guid ClaimId, string ClearinghouseClaimId) : DomainEvent;
public sealed record ClaimRejected(Guid ClaimId, string Reason) : DomainEvent;
