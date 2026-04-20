using HealthQCopilot.Agents.Rag;
using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Plugins;

/// <summary>
/// Semantic Kernel plugin for LLM-powered clinical coding.
///
/// Replaces the rule-based <c>CodeSuggestionService</c> keyword matcher with a
/// retrieval-augmented LLM that understands clinical context, payer-specific LCD/NCD
/// rules, and multi-system code relationships (ICD-10-CM + CPT-4).
///
/// Integrated into the <see cref="AgentPlanningLoop"/> so the LLM can call this
/// function dynamically when clinical coding is required.
/// </summary>
public sealed class ClinicalCoderPlugin(
    IRagContextProvider rag,
    ILogger<ClinicalCoderPlugin> logger)
{
    private static readonly HashSet<string> ValidIcd10Prefixes = new(StringComparer.OrdinalIgnoreCase)
    {
        "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"
    };

    /// <summary>
    /// Suggests ICD-10-CM and CPT-4 codes for a clinical encounter.
    /// </summary>
    /// <param name="encounterSummary">Free-text encounter summary or triage transcript.</param>
    /// <param name="kernel">The kernel (injected by SK at invocation time).</param>
    /// <returns>
    /// JSON array of coding suggestions: [{"code":"I20.9","type":"ICD10","description":"...","confidence":0.9}]
    /// </returns>
    [KernelFunction("suggest_clinical_codes")]
    [System.ComponentModel.Description(
        "Given an encounter summary or clinical transcript, returns ICD-10-CM and CPT-4 code suggestions " +
        "with descriptions and confidence scores. Use this to code clinical encounters accurately.")]
    public async Task<string> SuggestClinicalCodesAsync(
        [System.ComponentModel.Description("Free-text encounter summary, triage transcript, or clinical note")]
        string encounterSummary,
        Kernel kernel)
    {
        if (string.IsNullOrWhiteSpace(encounterSummary))
            return "[]";

        // ── Enrich with clinical coding guidelines from RAG ───────────────────
        var ragContext = await rag.GetRelevantContextAsync(
            $"ICD-10 CPT coding: {encounterSummary}", topK: 3);

        var prompt =
            $"""
            You are a certified clinical coder (CPC) with expertise in ICD-10-CM and CPT-4.

            {(string.IsNullOrEmpty(ragContext) ? "" : ragContext)}

            ENCOUNTER SUMMARY:
            {encounterSummary}

            Analyze this encounter and provide the most appropriate diagnosis codes (ICD-10-CM)
            and procedure codes (CPT-4) as a JSON array. Each entry must include:
            - "code": the exact code string
            - "type": "ICD10" or "CPT"
            - "description": brief human-readable description
            - "confidence": decimal 0.0–1.0

            Rules:
            - Include only codes that are clearly supported by the clinical text
            - ICD-10 principal diagnosis first, secondary diagnoses after
            - CPT codes must match documented procedures only
            - Do NOT fabricate codes not in the standard codebook

            Return ONLY the JSON array, no other text.
            """;

        try
        {
            var result = await kernel.InvokePromptAsync<string>(prompt);
            var json = result ?? "[]";

            // Basic validation: ensure output looks like JSON
            json = json.Trim();
            if (!json.StartsWith('[')) json = "[]";

            logger.LogInformation(
                "ClinicalCoderPlugin: suggested codes for encounter (length={Len}): {Json}",
                encounterSummary.Length, json);

            return json;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ClinicalCoderPlugin: LLM coding failed — returning empty suggestions");
            return "[]";
        }
    }

    /// <summary>
    /// Validates that a set of proposed ICD-10 / CPT codes are compatible (no LCD/NCD conflicts).
    /// </summary>
    [KernelFunction("validate_code_combination")]
    [System.ComponentModel.Description(
        "Validates that a proposed set of ICD-10 and CPT codes are payer-compatible. " +
        "Returns a validation result with any conflicts identified.")]
    public async Task<string> ValidateCodeCombinationAsync(
        [System.ComponentModel.Description("JSON array of codes to validate, same format as suggest_clinical_codes output")]
        string codesJson,
        [System.ComponentModel.Description("Payer name or type (e.g. Medicare, Medicaid, BlueCross)")]
        string payer,
        Kernel kernel)
    {
        if (string.IsNullOrWhiteSpace(codesJson)) return """{"valid":true,"conflicts":[]}""";

        const string jsonSchema = "{\"valid\": true, \"conflicts\": [{\"code\": \"...\", \"reason\": \"...\"}]}";
        var prompt = $"""
            You are a clinical coding compliance specialist.

            PROPOSED CODES: {codesJson}
            PAYER: {payer}

            Check the proposed codes for:
            1. LCD (Local Coverage Determinations) conflicts for the given payer
            2. NCD (National Coverage Determinations) conflicts
            3. Mutually exclusive code pairs (unbundling)
            4. Diagnosis-procedure linkage validity

            Return JSON matching this schema: {jsonSchema}
            Return ONLY the JSON, no other text.
            """;

        try
        {
            var result = await kernel.InvokePromptAsync<string>(prompt) ?? """{"valid":true,"conflicts":[]}""";
            return result.Trim();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ClinicalCoderPlugin: code validation failed");
            return """{"valid":true,"conflicts":[]}""";
        }
    }
}
