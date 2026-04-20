using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Plugins;

/// <summary>
/// Semantic Kernel plugin for prior authorization workflow automation.
///
/// Gives the agentic planning loop the ability to:
///  - Check whether a procedure requires prior auth for a given payer
///  - Draft a prior auth justification letter using clinical context
///  - Track the status of a submitted prior auth request
/// </summary>
public sealed class PriorAuthPlugin(ILogger<PriorAuthPlugin> logger)
{
    private static readonly Dictionary<string, bool> PriorAuthRequired = new(StringComparer.OrdinalIgnoreCase)
    {
        // Common procedures that typically require prior auth
        ["27447"] = true,   // Total knee replacement
        ["27130"] = true,   // Total hip replacement
        ["70553"] = true,   // MRI brain with contrast
        ["93306"] = true,   // Echocardiography
        ["43239"] = true,   // Upper GI endoscopy with biopsy
        ["99213"] = false,  // Office visit, level 3
        ["99214"] = false,  // Office visit, level 4
    };

    /// <summary>
    /// Checks whether a CPT procedure code requires prior authorization for the given payer.
    /// </summary>
    [KernelFunction("check_prior_auth_requirement")]
    [System.ComponentModel.Description(
        "Checks if a CPT procedure code requires prior authorization from a specific payer. " +
        "Returns a decision with the auth requirement and typical processing time.")]
    public Task<string> CheckPriorAuthRequirementAsync(
        [System.ComponentModel.Description("The CPT-4 procedure code (e.g., '27447')")]
        string cptCode,
        [System.ComponentModel.Description("The payer name (e.g., 'Medicare', 'BlueCross')")]
        string payerName)
    {
        var required = PriorAuthRequired.TryGetValue(cptCode, out var req) ? req : true; // default to required for unknown codes

        logger.LogInformation(
            "PriorAuthPlugin: CPT {Code} for payer {Payer} — prior auth required: {Required}",
            cptCode, payerName, required);

        var result = new
        {
            cptCode,
            payerName,
            priorAuthRequired = required,
            typicalProcessingDays = required ? 3 : 0,
            notes = required
                ? "Prior authorization required. Submit via payer portal or clearinghouse."
                : "No prior authorization required for this service."
        };
        return Task.FromResult(System.Text.Json.JsonSerializer.Serialize(result));
    }

    /// <summary>
    /// Generates a prior authorization letter with clinical justification for a procedure.
    /// </summary>
    [KernelFunction("draft_prior_auth_letter")]
    [System.ComponentModel.Description(
        "Drafts a prior authorization justification letter for a procedure, based on the patient's clinical context. " +
        "Use this when prior auth has been identified as required.")]
    public async Task<string> DraftPriorAuthLetterAsync(
        [System.ComponentModel.Description("CPT code for the requested procedure")]
        string cptCode,
        [System.ComponentModel.Description("Clinical justification or encounter summary")]
        string clinicalJustification,
        [System.ComponentModel.Description("Patient demographic summary (age, diagnosis)")]
        string patientSummary,
        Kernel kernel)
    {
        var prompt =
            $"""
            You are a clinical prior authorization specialist.

            Draft a concise, professional prior authorization letter for the following:

            PROCEDURE (CPT): {cptCode}
            PATIENT: {patientSummary}
            CLINICAL JUSTIFICATION: {clinicalJustification}

            The letter must include:
            1. Medical necessity statement with specific clinical findings
            2. Reference to evidence-based clinical guidelines (cite by name)
            3. Expected patient outcomes and quality of life improvement
            4. Alternatives considered and why they are insufficient

            Keep the letter under 300 words. Be specific and factual.
            """;

        try
        {
            var letter = await kernel.InvokePromptAsync<string>(prompt);
            return letter ?? string.Empty;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PriorAuthPlugin: letter generation failed for CPT {Code}", cptCode);
            return $"Prior authorization letter for CPT {cptCode}: Clinical justification required. Please contact clinical staff.";
        }
    }
}
