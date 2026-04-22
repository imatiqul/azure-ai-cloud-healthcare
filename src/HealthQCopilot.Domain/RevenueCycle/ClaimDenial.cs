using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.RevenueCycle;

/// <summary>
/// Represents a payer denial for a submitted claim.
/// Tracks denial reason, appeal status, and resubmission attempts.
/// Follows ANSI X12 835/837 denial reason code conventions (CARC/RARC).
/// </summary>
public class ClaimDenial : AggregateRoot<Guid>
{
    public Guid CodingJobId { get; private set; }
    public string ClaimNumber { get; private set; } = string.Empty;
    public string PatientId { get; private set; } = string.Empty;
    public string PayerId { get; private set; } = string.Empty;
    public string PayerName { get; private set; } = string.Empty;
    /// <summary>ANSI CARC (Claim Adjustment Reason Code), e.g. "CO-4", "PR-1".</summary>
    public string DenialReasonCode { get; private set; } = string.Empty;
    public string DenialReasonDescription { get; private set; } = string.Empty;
    public DenialCategory Category { get; private set; }
    public DenialStatus Status { get; private set; } = DenialStatus.Open;
    public decimal DeniedAmount { get; private set; }
    public DateTime DeniedAt { get; private set; }
    public DateTime? AppealedAt { get; private set; }
    public string? AppealNotes { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    public DenialResolution? Resolution { get; private set; }
    public int ResubmissionCount { get; private set; }
    public DateTime? LastResubmittedAt { get; private set; }
    /// <summary>Appeal deadline: typically 180 days from denial date (NAIC model).</summary>
    public DateTime AppealDeadline { get; private set; }

    private ClaimDenial() { }

    public static ClaimDenial Create(
        Guid codingJobId,
        string claimNumber,
        string patientId,
        string payerId,
        string payerName,
        string denialReasonCode,
        string denialReasonDescription,
        DenialCategory category,
        decimal deniedAmount,
        DateTime? appealDeadlineOverride = null)
    {
        return new ClaimDenial
        {
            Id = Guid.NewGuid(),
            CodingJobId = codingJobId,
            ClaimNumber = claimNumber,
            PatientId = patientId,
            PayerId = payerId,
            PayerName = payerName,
            DenialReasonCode = denialReasonCode,
            DenialReasonDescription = denialReasonDescription,
            Category = category,
            DeniedAmount = deniedAmount,
            Status = DenialStatus.Open,
            DeniedAt = DateTime.UtcNow,
            // Standard 180-day appeal window (NAIC model regulation); seed may override for demo scenarios.
            AppealDeadline = appealDeadlineOverride ?? DateTime.UtcNow.AddDays(180),
        };
    }

    /// <summary>Submit an appeal with supporting documentation notes.</summary>
    public Result Appeal(string appealNotes)
    {
        if (Status == DenialStatus.Resolved)
            return Result.Failure("Cannot appeal a resolved denial");
        if (DateTime.UtcNow > AppealDeadline)
            return Result.Failure($"Appeal deadline of {AppealDeadline:yyyy-MM-dd} has passed");

        Status = DenialStatus.UnderAppeal;
        AppealedAt = DateTime.UtcNow;
        AppealNotes = appealNotes;
        return Result.Success();
    }

    /// <summary>Resubmit a corrected claim (increments attempt counter).</summary>
    public Result Resubmit()
    {
        if (Status == DenialStatus.Resolved)
            return Result.Failure("Cannot resubmit a resolved denial");
        if (ResubmissionCount >= 3)
            return Result.Failure("Maximum resubmission attempts (3) reached; escalate to payer relations");

        Status = DenialStatus.Resubmitted;
        ResubmissionCount++;
        LastResubmittedAt = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Mark denial as resolved — either approved (overturn) or written off.</summary>
    public Result Resolve(DenialResolution resolution)
    {
        if (Status == DenialStatus.Resolved)
            return Result.Failure("Already resolved");

        Status = DenialStatus.Resolved;
        Resolution = resolution;
        ResolvedAt = DateTime.UtcNow;
        return Result.Success();
    }
}

public enum DenialStatus { Open, UnderAppeal, Resubmitted, Resolved }

/// <summary>CARC-based denial categories for workflow routing.</summary>
public enum DenialCategory
{
    /// <summary>CO — Contractual obligation / write-off.</summary>
    Contractual,
    /// <summary>PR — Patient responsibility (deductible/copay).</summary>
    PatientResponsibility,
    /// <summary>OA — Other adjustments.</summary>
    OtherAdjustment,
    /// <summary>PI — Payer initiated reductions.</summary>
    PayerInitiated,
    /// <summary>Coding error — wrong CPT/ICD-10 or modifier.</summary>
    CodingError,
    /// <summary>Medical necessity denial — missing documentation.</summary>
    MedicalNecessity,
    /// <summary>Eligibility — patient not eligible on date of service.</summary>
    Eligibility,
    /// <summary>Duplicate claim.</summary>
    Duplicate,
}

public enum DenialResolution
{
    Overturned,   // Payer reversed; claim paid
    Partial,      // Partial payment after appeal
    WriteOff,     // Written off (uncollectable)
    PatientBilled // Redirected to patient responsibility
}
