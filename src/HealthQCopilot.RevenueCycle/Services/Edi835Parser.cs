using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Domain.RevenueCycle;

namespace HealthQCopilot.RevenueCycle.Services;

/// <summary>
/// Parses an ASC X12 5010 835 Electronic Remittance Advice (ERA) document
/// into a <see cref="RemittanceAdvice"/> domain entity.
///
/// Segment terminator: ~  |  Element separator: *  |  Sub-element separator: :
/// Based on ASC X12 005010X221A1 (835 Health Care Claim Payment/Advice).
/// </summary>
public class Edi835Parser
{
    public Result<RemittanceAdvice> Parse(string edi835Content)
    {
        if (string.IsNullOrWhiteSpace(edi835Content))
            return Result<RemittanceAdvice>.Failure("EDI content is empty.");

        // Auto-detect segment terminator from ISA header (position 105)
        if (edi835Content.Length < 106)
            return Result<RemittanceAdvice>.Failure("Document is too short to be a valid 835.");

        var segTerm = edi835Content[105];
        var eleSep  = edi835Content[3];

        var segments = edi835Content
            .Split(segTerm, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.Split(eleSep))
            .ToList();

        // ── BPR — Payment Information ─────────────────────────────────────────
        var bpr = segments.FirstOrDefault(s => s[0] == "BPR");
        if (bpr is null)
            return Result<RemittanceAdvice>.Failure("BPR segment not found — document is not an 835.");

        if (!decimal.TryParse(bpr.ElementAt(2, "0"), out var paymentAmount))
            return Result<RemittanceAdvice>.Failure("BPR02 (payment amount) could not be parsed.");

        var totalCents = (long)(paymentAmount * 100);

        var paymentMethodCode = bpr.ElementAt(3, "CHK");
        var paymentMethod = paymentMethodCode switch
        {
            "ACH" or "FWT" => PaymentMethod.Eft,
            "VCP" or "VCK" => PaymentMethod.VirtualCard,
            _               => PaymentMethod.Check,
        };

        var paymentDateStr = bpr.ElementAt(16, DateTime.UtcNow.ToString("yyyyMMdd"));
        var paymentDate = DateTime.TryParseExact(paymentDateStr, "yyyyMMdd",
            null, System.Globalization.DateTimeStyles.None, out var pd)
            ? pd
            : DateTime.UtcNow;

        // ── TRN — Payment Reference ───────────────────────────────────────────
        var trn = segments.FirstOrDefault(s => s[0] == "TRN");
        var paymentRef = trn?.ElementAt(2, Guid.NewGuid().ToString("N")[..15]) ?? Guid.NewGuid().ToString("N")[..15];

        // ── NM1*PR — Payer Name ───────────────────────────────────────────────
        var nm1Pr = segments.FirstOrDefault(s => s[0] == "NM1" && s.ElementAt(1, "") == "PR");
        var payerName = nm1Pr?.ElementAt(3, "Unknown Payer") ?? "Unknown Payer";

        // ── CLP — Claim Payment Information ──────────────────────────────────
        var claimLines = new List<RemittanceClaimLine>();
        RemittanceClaimLine? currentLine = null;
        var svcLines = new List<RemittanceServiceLine>();

        foreach (var seg in segments)
        {
            var id = seg[0];

            if (id == "CLP")
            {
                // Flush previous claim line
                if (currentLine is not null)
                {
                    currentLine.ServiceLines = [.. svcLines];
                    claimLines.Add(currentLine);
                    svcLines.Clear();
                }

                if (!decimal.TryParse(seg.ElementAt(3, "0"), out var billedAmt))
                    billedAmt = 0;
                if (!decimal.TryParse(seg.ElementAt(4, "0"), out var paidAmt))
                    paidAmt = 0;

                currentLine = new RemittanceClaimLine
                {
                    ClearinghouseClaimId = seg.ElementAt(1, string.Empty),
                    ClpStatusCode        = seg.ElementAt(2, "1"),
                    BilledAmountCents    = (long)(billedAmt * 100),
                    PaidAmountCents      = (long)(paidAmt * 100),
                    PatientId            = string.Empty,  // resolved via NM1*QC below
                };
                continue;
            }

            // NM1*QC — Patient name inside 2100 loop (after CLP)
            if (id == "NM1" && seg.ElementAt(1, "") == "QC" && currentLine is not null)
            {
                currentLine.PatientId = seg.ElementAt(9, string.Empty);
                continue;
            }

            // CAS — Claim Adjustment (CARC/RARC denial codes)
            if (id == "CAS" && currentLine is not null)
            {
                var carc = seg.ElementAt(2, string.Empty);
                if (!string.IsNullOrEmpty(carc) && currentLine.DenialReasonCode is null)
                    currentLine.DenialReasonCode = carc;
                continue;
            }

            // SVC — Service Line Payment
            if (id == "SVC" && currentLine is not null)
            {
                if (!decimal.TryParse(seg.ElementAt(2, "0"), out var svcBilled))
                    svcBilled = 0;
                if (!decimal.TryParse(seg.ElementAt(3, "0"), out var svcPaid))
                    svcPaid = 0;

                // SVC01 sub-element: HC:CPT_CODE
                var svcCode = seg.ElementAt(1, "").Split(':').ElementAtOrDefault(1) ?? "UNKNOWN";

                svcLines.Add(new RemittanceServiceLine
                {
                    ProcedureCode = svcCode,
                    BilledCents   = (long)(svcBilled * 100),
                    PaidCents     = (long)(svcPaid * 100),
                });
                continue;
            }
        }

        // Flush final claim line
        if (currentLine is not null)
        {
            currentLine.ServiceLines = [.. svcLines];
            claimLines.Add(currentLine);
        }

        if (claimLines.Count == 0)
            return Result<RemittanceAdvice>.Failure("No CLP segments found — document contains no claim payments.");

        var remittance = RemittanceAdvice.Create(
            paymentRef, payerName, totalCents, paymentMethod, paymentDate, claimLines);

        return Result<RemittanceAdvice>.Success(remittance);
    }
}

/// <summary>Safe array accessor that returns a default when index is out of range.</summary>
file static class ArrayExtensions
{
    public static string ElementAt(this string[] arr, int index, string fallback) =>
        index < arr.Length ? arr[index] : fallback;
}
