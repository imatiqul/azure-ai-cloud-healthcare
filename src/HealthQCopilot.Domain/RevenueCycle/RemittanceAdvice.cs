using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.RevenueCycle;

/// <summary>
/// Represents an EDI 835 Electronic Remittance Advice (ERA) received from a payer.
/// Tracks payment allocation for one or more claim lines.
/// </summary>
public sealed class RemittanceAdvice : AggregateRoot<Guid>
{
    /// <summary>Payer-assigned check/EFT number (CLP02 / BPR reference).</summary>
    public string PaymentReferenceNumber { get; private set; } = default!;

    /// <summary>Paying entity name from the NM1*PR segment.</summary>
    public string PayerName { get; private set; } = default!;

    /// <summary>Total payment amount in cents to avoid decimal rounding.</summary>
    public long TotalPaymentCents { get; private set; }

    public PaymentMethod PaymentMethod { get; private set; }

    public DateTime PaymentDate { get; private set; }

    public RemittanceStatus Status { get; private set; }

    /// <summary>Individual claim-level payment allocations parsed from CLP/SVC segments.</summary>
    public List<RemittanceClaimLine> ClaimLines { get; private set; } = [];

    public DateTime CreatedAt { get; private set; }
    public DateTime? PostedAt { get; private set; }

    private RemittanceAdvice() { }

    /// <summary>
    /// Creates a new RemittanceAdvice from parsed EDI 835 data.
    /// The <paramref name="claimLines"/> are the individual CLP segments within the 835.
    /// </summary>
    public static RemittanceAdvice Create(
        string paymentReferenceNumber,
        string payerName,
        long totalPaymentCents,
        PaymentMethod paymentMethod,
        DateTime paymentDate,
        List<RemittanceClaimLine> claimLines)
    {
        var ra = new RemittanceAdvice
        {
            Id = Guid.NewGuid(),
            PaymentReferenceNumber = paymentReferenceNumber,
            PayerName = payerName,
            TotalPaymentCents = totalPaymentCents,
            PaymentMethod = paymentMethod,
            PaymentDate = paymentDate,
            ClaimLines = claimLines,
            Status = RemittanceStatus.Received,
            CreatedAt = DateTime.UtcNow,
        };
        ra.RaiseDomainEvent(new RemittanceReceived(ra.Id, payerName, totalPaymentCents));
        return ra;
    }

    /// <summary>Posts the remittance to the AR ledger — applies payments to claim submissions.</summary>
    public Result Post()
    {
        if (Status != RemittanceStatus.Received)
            return Result.Failure($"Cannot post remittance in {Status} state.");
        Status = RemittanceStatus.Posted;
        PostedAt = DateTime.UtcNow;
        RaiseDomainEvent(new RemittancePosted(Id, TotalPaymentCents));
        return Result.Success();
    }
}

/// <summary>
/// One line of payment within a remittance: maps to a single CLP segment in 835,
/// and contains zero or more SVC (service line adjustment) sub-segments.
/// </summary>
public sealed class RemittanceClaimLine
{
    public Guid Id { get; init; } = Guid.NewGuid();

    /// <summary>Clearinghouse claim ID cross-referencing the original 837 submission.</summary>
    public string ClearinghouseClaimId { get; init; } = default!;

    public string PatientId { get; set; } = default!;

    public long BilledAmountCents { get; init; }
    public long PaidAmountCents { get; init; }
    public long AdjustmentCents => BilledAmountCents - PaidAmountCents;

    /// <summary>CLP05 — claim status code: 1=processed, 2=adjusted, 3=forwarded, 4=denied, 22=reversal.</summary>
    public string ClpStatusCode { get; init; } = "1";

    /// <summary>Human-readable denial reason from CARC (Claim Adjustment Reason Code) if denied.</summary>
    public string? DenialReasonCode { get; set; }

    public List<RemittanceServiceLine> ServiceLines { get; set; } = [];
}

/// <summary>
/// SVC segment — one service line within a claim remittance.
/// </summary>
public sealed class RemittanceServiceLine
{
    public string ProcedureCode { get; init; } = default!;
    public long BilledCents { get; init; }
    public long PaidCents { get; init; }
    public string? ReasonCode { get; init; }
}

public enum PaymentMethod { Check, Eft, VirtualCard }

public enum RemittanceStatus { Received, Posted, Disputed }

// ── Domain Events ────────────────────────────────────────────────────────────
public sealed record RemittanceReceived(Guid RemittanceId, string PayerName, long TotalCents) : DomainEvent;
public sealed record RemittancePosted(Guid RemittanceId, long TotalCents) : DomainEvent;
