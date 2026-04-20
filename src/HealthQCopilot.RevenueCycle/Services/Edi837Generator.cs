using HealthQCopilot.Domain.RevenueCycle;
using System.Text;

namespace HealthQCopilot.RevenueCycle.Services;

/// <summary>
/// Generates ASC X12 5010 837P (Professional Claim) EDI transactions.
///
/// Segment terminator: ~  |  Element separator: *  |  Sub-element separator: :
/// Based on ASC X12 005010X222A2 (837 Professional) technical report.
///
/// Only segments required for a minimal clean claim are emitted.
/// A production implementation would incorporate ANSI 835/837 schema validation
/// and clearinghouse-specific loop requirements.
/// </summary>
public class Edi837Generator
{
    private static readonly char Seg = '~';   // segment terminator
    private static readonly char Ele = '*';   // element separator
    private static readonly char Sub = ':';   // sub-element separator

    /// <summary>
    /// Generates a 837P EDI document for a single claim submission.
    /// </summary>
    public string Generate(ClaimSubmission claim, Edi837ProviderInfo provider, Edi837SubscriberInfo subscriber)
    {
        var sb = new StringBuilder();
        var today = DateTime.UtcNow;
        var dateFmt = today.ToString("yyyyMMdd");
        var timeFmt = today.ToString("HHmm");

        // ── ISA — Interchange Control Header ─────────────────────────────────
        sb.Append($"ISA{Ele}00{Ele}          {Ele}00{Ele}          {Ele}ZZ{Ele}");
        sb.Append($"{Pad(provider.SenderId, 15)}{Ele}ZZ{Ele}");
        sb.Append($"{Pad(subscriber.PayerId, 15)}{Ele}");
        sb.Append($"{today:yyMMdd}{Ele}{timeFmt}{Ele}^{Ele}00501{Ele}");
        sb.Append($"{claim.InterchangeControlNumber}{Ele}0{Ele}P{Ele}:{Seg}\n");

        // ── GS — Functional Group Header ─────────────────────────────────────
        var gsn = claim.InterchangeControlNumber[..6];
        sb.Append($"GS{Ele}HC{Ele}{provider.SenderId.Trim()}{Ele}{subscriber.PayerId.Trim()}");
        sb.Append($"{Ele}{dateFmt}{Ele}{timeFmt}{Ele}{gsn}{Ele}X{Ele}005010X222A2{Seg}\n");

        // ── ST — Transaction Set Header ───────────────────────────────────────
        sb.Append($"ST{Ele}837{Ele}0001{Ele}005010X222A2{Seg}\n");

        // ── BPR21 — Beginning of Transaction Set / Financial Info ─────────────
        sb.Append($"BHT{Ele}0019{Ele}00{Ele}{claim.Id:N}{Ele}{dateFmt}{Ele}{timeFmt}{Ele}CH{Seg}\n");

        // ── 1000A — Submitter ─────────────────────────────────────────────────
        sb.Append($"NM1{Ele}41{Ele}2{Ele}{provider.OrganizationName}{Ele}{Ele}{Ele}{Ele}{Ele}46{Ele}{provider.Npi}{Seg}\n");
        sb.Append($"PER{Ele}IC{Ele}{provider.ContactName}{Ele}TE{Ele}{provider.Phone}{Seg}\n");

        // ── 1000B — Receiver (Payer / Clearinghouse) ──────────────────────────
        sb.Append($"NM1{Ele}40{Ele}2{Ele}{claim.InsurancePayer}{Ele}{Ele}{Ele}{Ele}{Ele}46{Ele}{subscriber.PayerId.Trim()}{Seg}\n");

        // ── 2000A — Billing Provider Loop ────────────────────────────────────
        sb.Append($"HL{Ele}1{Ele}{Ele}20{Ele}1{Seg}\n");
        sb.Append($"PRV{Ele}BI{Ele}PXC{Ele}207Q00000X{Seg}\n");
        sb.Append($"NM1{Ele}85{Ele}2{Ele}{provider.OrganizationName}{Ele}{Ele}{Ele}{Ele}{Ele}XX{Ele}{provider.Npi}{Seg}\n");
        sb.Append($"N3{Ele}{provider.AddressLine1}{Seg}\n");
        sb.Append($"N4{Ele}{provider.City}{Ele}{provider.StateCode}{Ele}{provider.Zip}{Seg}\n");
        sb.Append($"REF{Ele}EI{Ele}{provider.TaxId}{Seg}\n");

        // ── 2000B — Subscriber Loop ───────────────────────────────────────────
        sb.Append($"HL{Ele}2{Ele}1{Ele}22{Ele}0{Seg}\n");
        sb.Append($"SBR{Ele}P{Ele}18{Ele}{Ele}{Ele}{Ele}{Ele}{Ele}{Ele}MB{Seg}\n");
        sb.Append($"NM1{Ele}IL{Ele}1{Ele}{subscriber.LastName}{Ele}{subscriber.FirstName}{Ele}{Ele}{Ele}{Ele}MI{Ele}{subscriber.MemberId}{Seg}\n");
        sb.Append($"N3{Ele}{subscriber.AddressLine1}{Seg}\n");
        sb.Append($"N4{Ele}{subscriber.City}{Ele}{subscriber.StateCode}{Ele}{subscriber.Zip}{Seg}\n");
        sb.Append($"DMG{Ele}D8{Ele}{subscriber.DateOfBirth:yyyyMMdd}{Ele}{subscriber.GenderCode}{Seg}\n");

        // Payer name/ID
        sb.Append($"NM1{Ele}PR{Ele}2{Ele}{claim.InsurancePayer}{Ele}{Ele}{Ele}{Ele}{Ele}PI{Ele}{subscriber.PayerId.Trim()}{Seg}\n");

        // ── 2300 — Claim Information ──────────────────────────────────────────
        var totalDollars = (claim.TotalChargesCents / 100m).ToString("F2");
        sb.Append($"CLM{Ele}{claim.EncounterId}{Ele}{totalDollars}{Ele}{Ele}{Ele}11:B:1{Ele}Y{Ele}A{Ele}Y{Ele}I{Seg}\n");
        sb.Append($"REF{Ele}D9{Ele}{claim.EncounterId}{Seg}\n");  // Claim number cross-ref

        // Date of service (DOS) — use today as default (production: actual encounter date)
        sb.Append($"DTP{Ele}472{Ele}D8{Ele}{dateFmt}{Seg}\n");

        // ICD-10-CM diagnosis codes
        var diagSegment = new StringBuilder($"HI");
        for (int i = 0; i < claim.DiagnosisCodes.Count && i < 12; i++)
        {
            var qualifier = i == 0 ? "ABK" : "ABF";   // ABK=principal, ABF=secondary
            diagSegment.Append($"{Ele}{qualifier}{Sub}{claim.DiagnosisCodes[i]}");
        }
        sb.Append(diagSegment).Append(Seg).Append('\n');

        // ── 2400 — Service Line ───────────────────────────────────────────────
        // Single service line — one per revenue code / CPT for professional claim
        var lineDollars = totalDollars;
        sb.Append($"LX{Ele}1{Seg}\n");
        sb.Append($"SV1{Ele}HC{Sub}{claim.DiagnosisCodes.FirstOrDefault() ?? "99213"}{Ele}{lineDollars}{Ele}UN{Ele}1{Ele}{Ele}1{Seg}\n");
        sb.Append($"DTP{Ele}472{Ele}D8{Ele}{dateFmt}{Seg}\n");

        // ── SE — Transaction Set Trailer ──────────────────────────────────────
        // Segment count = number of segments between ST and SE inclusive
        var segCount = CountSegments(sb.ToString()) + 1; // +1 for SE itself
        sb.Append($"SE{Ele}{segCount}{Ele}0001{Seg}\n");

        // ── GE — Functional Group Trailer ────────────────────────────────────
        sb.Append($"GE{Ele}1{Ele}{gsn}{Seg}\n");

        // ── IEA — Interchange Control Trailer ────────────────────────────────
        sb.Append($"IEA{Ele}1{Ele}{claim.InterchangeControlNumber}{Seg}");

        return sb.ToString();
    }

    private static int CountSegments(string edi) =>
        edi.Split(Seg, StringSplitOptions.RemoveEmptyEntries).Length;

    private static string Pad(string value, int length) =>
        value.Length >= length ? value[..length] : value.PadRight(length);
}

// ── Supporting DTOs ───────────────────────────────────────────────────────────

/// <summary>Billing provider information for 837P generation.</summary>
public sealed record Edi837ProviderInfo(
    string SenderId,
    string Npi,
    string TaxId,
    string OrganizationName,
    string ContactName,
    string Phone,
    string AddressLine1,
    string City,
    string StateCode,
    string Zip);

/// <summary>Subscriber / patient information for 837P generation.</summary>
public sealed record Edi837SubscriberInfo(
    string PayerId,
    string MemberId,
    string FirstName,
    string LastName,
    string AddressLine1,
    string City,
    string StateCode,
    string Zip,
    DateTime DateOfBirth,
    string GenderCode = "U");
