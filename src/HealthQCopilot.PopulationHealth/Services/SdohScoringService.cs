using HealthQCopilot.Domain.PopulationHealth;

namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Social Determinants of Health (SDOH) screening and scoring service.
///
/// Implements an 8-domain questionnaire aligned with PRAPARE (Protocol for Responding to and
/// Assessing Patients' Assets, Risks, and Experiences) and the HL7 FHIR Gravity Project
/// SDOH Clinical Care terminology (LOINC panel 93025-5).
///
/// Domains:
///   HousingInstability, FoodInsecurity, Transportation, SocialIsolation,
///   FinancialStrain, Employment, Education, DigitalAccess
///
/// Scoring: each domain 0–3 (None / Mild / Moderate / Severe).
/// Total range 0–24.  Composite risk weight [0.0, 0.30] blended into RiskCalculationService.
/// </summary>
public sealed class SdohScoringService
{
    private static readonly string[] Domains =
    [
        "HousingInstability", "FoodInsecurity", "Transportation", "SocialIsolation",
        "FinancialStrain", "Employment", "Education", "DigitalAccess"
    ];

    private static readonly Dictionary<string, string> DomainLabel = new()
    {
        ["HousingInstability"] = "Housing instability or homelessness risk",
        ["FoodInsecurity"] = "Food insecurity or inadequate nutrition",
        ["Transportation"] = "Transportation barrier limiting access to care",
        ["SocialIsolation"] = "Social isolation or lack of social support network",
        ["FinancialStrain"] = "Financial strain or inability to afford healthcare costs",
        ["Employment"] = "Unemployment or hazardous / unstable work conditions",
        ["Education"] = "Low health literacy or education-related care barrier",
        ["DigitalAccess"] = "Lack of digital access for telehealth or health apps",
    };

    private static readonly Dictionary<string, string[]> DomainInterventions = new()
    {
        ["HousingInstability"] =
        [
            "Refer to local housing assistance programme (HUD, Section 8)",
            "Connect with homeless-prevention or rapid-rehousing services",
            "Document housing status for FHIR SocialHistory Observation",
        ],
        ["FoodInsecurity"] =
        [
            "Connect patient with SNAP enrolment navigator or food bank",
            "Refer to WIC programme if age/income eligible",
            "Provide community meal programme calendar",
        ],
        ["Transportation"] =
        [
            "Arrange NEMT (non-emergency medical transport) for next appointment",
            "Offer telehealth appointment as transport-barrier alternative",
            "Provide ride-share or bus-voucher programme referral",
        ],
        ["SocialIsolation"] =
        [
            "Enrol in peer-support group or structured social programme",
            "Assign care navigator for scheduled weekly check-in calls",
            "Refer to senior services, adult day-programme, or volunteer visiting",
        ],
        ["FinancialStrain"] =
        [
            "Screen for pharmaceutical assistance programmes (PAP, NeedyMeds)",
            "Connect with hospital financial counsellor for charity-care review",
            "Screen for SSDI / SSI / Medicaid eligibility",
        ],
        ["Employment"] =
        [
            "Refer to state vocational rehabilitation services",
            "Review short-term disability insurance coverage options",
            "Provide occupational health referral for work-related conditions",
        ],
        ["Education"] =
        [
            "Provide plain-language discharge and care-plan instructions",
            "Use teach-back method at next clinical encounter",
            "Schedule health-literacy coaching session with care educator",
        ],
        ["DigitalAccess"] =
        [
            "Provide information on device / data-plan assistance programmes",
            "Schedule in-person visit as alternative to telehealth",
            "Connect with digital-literacy programme at local library",
        ],
    };

    /// <summary>
    /// Score an SDOH questionnaire and return a persisted domain entity.
    /// </summary>
    public PatientSdohAssessment Score(SdohAssessmentRequest request)
    {
        var scores = new Dictionary<string, int>();
        int total = 0;

        foreach (var domain in Domains)
        {
            int raw = request.DomainScores.TryGetValue(domain, out var s)
                      ? Math.Clamp(s, 0, 3)
                      : 0;
            scores[domain] = raw;
            total += raw;
        }

        var riskLevel = total switch
        {
            <= 4 => "Low",
            <= 12 => "Moderate",
            _ => "High",
        };

        // [0, 24] → [0.0, 0.30]
        double compositeWeight = Math.Round(total / 24.0 * 0.30, 4);

        // Top 3 highest-scoring domains as narrative needs
        var prioritized = scores
            .Where(kv => kv.Value > 0)
            .OrderByDescending(kv => kv.Value)
            .Take(3)
            .Select(kv => DomainLabel.GetValueOrDefault(kv.Key, kv.Key))
            .ToList();

        // Interventions for domains scored ≥ 2 (Moderate / Severe)
        var interventions = scores
            .Where(kv => kv.Value >= 2)
            .OrderByDescending(kv => kv.Value)
            .SelectMany(kv => DomainInterventions.GetValueOrDefault(kv.Key, []))
            .Distinct()
            .ToList();

        return PatientSdohAssessment.Create(
            patientId: request.PatientId,
            totalScore: total,
            riskLevel: riskLevel,
            compositeRiskWeight: compositeWeight,
            domainScores: scores,
            prioritizedNeeds: prioritized,
            recommendedActions: interventions,
            assessedBy: request.AssessedBy,
            notes: request.Notes);
    }
}

/// <summary>SDOH screening questionnaire payload.</summary>
/// <param name="PatientId">GUID or MRN of the patient being assessed.</param>
/// <param name="DomainScores">
/// Dictionary keyed by domain name (e.g. "HousingInstability") with score 0–3.
/// Domains: HousingInstability, FoodInsecurity, Transportation, SocialIsolation,
///          FinancialStrain, Employment, Education, DigitalAccess.
/// Score meanings: 0=None, 1=Mild, 2=Moderate, 3=Severe.
/// </param>
public sealed record SdohAssessmentRequest(
    string PatientId,
    Dictionary<string, int> DomainScores,
    string? AssessedBy = null,
    string? Notes = null);
