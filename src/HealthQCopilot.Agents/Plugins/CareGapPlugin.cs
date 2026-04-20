using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Plugins;

/// <summary>
/// Semantic Kernel plugin for HEDIS-based care gap detection and prioritization.
///
/// Exposes functions the agentic planning loop can call to:
///  - Identify open care gaps for a patient based on clinical context
///  - Prioritize gaps by clinical urgency and HEDIS measure weight
///  - Generate patient-specific outreach recommendations
/// </summary>
public sealed class CareGapPlugin(ILogger<CareGapPlugin> logger)
{
    // HEDIS measures mapped to their description and typical intervention
    private static readonly (string Code, string Description, string Intervention, double Weight)[] HedisMeasures =
    [
        ("CDC-HbA1c",  "Diabetes HbA1c Control (<9%)",          "Annual HbA1c testing",           0.90),
        ("CBP",        "Controlling High Blood Pressure",        "BP measurement + med review",    0.85),
        ("BCS",        "Breast Cancer Screening (women 50–74)",  "Mammography",                    0.80),
        ("COL",        "Colorectal Cancer Screening (50–75)",    "Colonoscopy / FIT test",          0.80),
        ("EED",        "Eye Exam for Diabetic Patients",         "Annual dilated eye exam",         0.75),
        ("SMC",        "Statin Medication for Patients w/ CV",   "Statin prescription review",      0.85),
        ("WCC-BMI",    "BMI Assessment & Counseling",            "BMI measurement + counseling",    0.70),
        ("FUH",        "Follow-Up After Hospitalization MH",     "7-day follow-up appointment",     0.88),
    ];

    /// <summary>
    /// Identifies open care gaps for a patient given their clinical summary.
    /// Returns a prioritized list of HEDIS care gap interventions.
    /// </summary>
    [KernelFunction("identify_care_gaps")]
    [System.ComponentModel.Description(
        "Identifies open HEDIS care gaps for a patient based on their clinical summary. " +
        "Returns a prioritized list of recommended preventive interventions.")]
    public Task<string> IdentifyCareGapsAsync(
        [System.ComponentModel.Description("Patient clinical summary including age, sex, diagnoses, and recent lab results")]
        string patientClinicalSummary)
    {
        // Extract simple indicators from the summary text to determine applicable measures
        var summary = patientClinicalSummary.ToLowerInvariant();
        var gaps = new List<object>();

        foreach (var (code, description, intervention, weight) in HedisMeasures)
        {
            var applicable = code switch
            {
                "CDC-HbA1c" => summary.Contains("diabetes") || summary.Contains("hba1c") || summary.Contains("diabetic"),
                "CBP" => summary.Contains("hypertension") || summary.Contains("blood pressure") || summary.Contains("htn"),
                "BCS" => summary.Contains("female") || summary.Contains("woman") || summary.Contains("breast"),
                "COL" => summary.Contains("50") || summary.Contains("51") || summary.Contains("52") ||
                               summary.Contains("53") || summary.Contains("54") || summary.Contains("55") ||
                               summary.Contains("60") || summary.Contains("65") || summary.Contains("70"),
                "EED" => summary.Contains("diabetes") || summary.Contains("diabetic"),
                "SMC" => summary.Contains("cardiovascular") || summary.Contains("heart disease") || summary.Contains("cad"),
                "WCC-BMI" => true,   // applicable to all adult patients
                "FUH" => summary.Contains("mental health") || summary.Contains("psychiatric") || summary.Contains("depression"),
                _ => false
            };

            if (applicable)
            {
                gaps.Add(new
                {
                    hedisCode = code,
                    description,
                    intervention,
                    priority = weight >= 0.85 ? "High" : weight >= 0.75 ? "Medium" : "Low",
                    weight
                });
            }
        }

        // Sort by weight descending
        gaps = gaps
            .OrderByDescending(g => ((dynamic)g).weight)
            .ToList();

        logger.LogInformation(
            "CareGapPlugin: identified {Count} care gaps from patient summary",
            gaps.Count);

        return Task.FromResult(System.Text.Json.JsonSerializer.Serialize(gaps));
    }

    /// <summary>
    /// Generates personalized outreach messages for identified care gaps.
    /// </summary>
    [KernelFunction("generate_care_gap_outreach")]
    [System.ComponentModel.Description(
        "Generates personalized patient outreach messages for identified care gaps. " +
        "Use this after identify_care_gaps to create actionable next steps for the patient.")]
    public async Task<string> GenerateCareGapOutreachAsync(
        [System.ComponentModel.Description("JSON array of care gaps from identify_care_gaps")]
        string careGapsJson,
        [System.ComponentModel.Description("Patient's preferred name")]
        string patientName,
        [System.ComponentModel.Description("Patient's preferred language (e.g., 'English', 'Spanish')")]
        string language,
        Kernel kernel)
    {
        const string jsonSchema = "[{\"hedisCode\": \"...\", \"message\": \"...\"}]";
        var prompt = $"""
            You are a patient care coordinator at a healthcare clinic.

            Generate friendly, personalized outreach messages for the following care gaps:
            {careGapsJson}

            Patient name: {patientName}
            Language: {language}

            For each care gap, write a concise message (2-3 sentences) that:
            1. Explains why this preventive care is important for them personally
            2. Makes scheduling an appointment feel easy and non-threatening
            3. Is warm and supportive in tone

            Return a JSON array matching this schema: {jsonSchema}
            """;

        try
        {
            var result = await kernel.InvokePromptAsync<string>(prompt);
            return result?.Trim() ?? careGapsJson;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "CareGapPlugin: outreach generation failed");
            return careGapsJson;
        }
    }
}
