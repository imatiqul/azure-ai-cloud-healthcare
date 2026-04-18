using HealthQCopilot.Domain.Agents;

namespace HealthQCopilot.RevenueCycle.Services;

/// <summary>
/// Rule-based ICD-10 code suggestion from triage level and reasoning text.
/// </summary>
public sealed class CodeSuggestionService
{
    public List<string> SuggestCodes(TriageLevel level, string reasoning)
    {
        var text = reasoning.ToLowerInvariant();
        var codes = new List<string>();

        // Cardiac / chest pain
        if (text.Contains("chest") || text.Contains("cardiac") || text.Contains("heart") || text.Contains("myocard"))
        {
            codes.AddRange(["I20.9", "R07.9"]);
        }

        // Respiratory
        if (text.Contains("respiratory") || text.Contains("cough") || text.Contains("breath") || text.Contains("pulmon") || text.Contains("wheez"))
        {
            codes.AddRange(["J06.9", "R05.9"]);
        }

        // Fever / infection
        if (text.Contains("fever") || text.Contains("infect") || text.Contains("sepsis") || text.Contains("temperatur"))
        {
            codes.AddRange(["R50.9", "A49.9"]);
        }

        // Headache / neurological
        if (text.Contains("headache") || text.Contains("migraine") || text.Contains("neuro") || text.Contains("dizzi") || text.Contains("syncop"))
        {
            codes.Add("R51.9");
        }

        // Abdominal
        if (text.Contains("abdomin") || text.Contains("stomach") || text.Contains("nausea") || text.Contains("vomit") || text.Contains("bowel"))
        {
            codes.Add("R10.9");
        }

        // Diabetes
        if (text.Contains("diabetes") || text.Contains("glucose") || text.Contains("hyperglycemia") || text.Contains("diabetic"))
        {
            codes.AddRange(["E11.9", "Z79.84"]);
        }

        // Hypertension
        if (text.Contains("hypertension") || text.Contains("blood pressure") || text.Contains("hypertensive"))
        {
            codes.Add("I10");
        }

        // Musculoskeletal pain
        if (text.Contains("pain") && (text.Contains("back") || text.Contains("joint") || text.Contains("muscle") || text.Contains("lumbar")))
        {
            codes.Add("M79.3");
        }

        // Allergy / asthma
        if (text.Contains("allergy") || text.Contains("allergic") || text.Contains("asthma") || text.Contains("anaphyl"))
        {
            codes.AddRange(["J45.20", "J30.1"]);
        }

        // Always include encounter code for urgent/immediate triage
        if (level is TriageLevel.P1_Immediate or TriageLevel.P2_Urgent)
        {
            codes.Add("Z00.00");
        }

        // Fallback: general encounter
        if (codes.Count == 0)
        {
            codes.Add("Z00.00");
        }

        return codes.Distinct().ToList();
    }

    public List<string> SuggestCodes(string triageLevelName, string reasoning)
    {
        var level = Enum.TryParse<TriageLevel>(triageLevelName, out var parsed)
            ? parsed
            : TriageLevel.P3_Standard;
        return SuggestCodes(level, reasoning);
    }
}
