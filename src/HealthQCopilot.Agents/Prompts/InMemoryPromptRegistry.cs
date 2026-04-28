namespace HealthQCopilot.Agents.Prompts;

/// <summary>
/// W4.5 — in-memory <see cref="IPromptRegistry"/>. Seeds the live agent prompts
/// at v1 so existing call sites can migrate from hard-coded strings to
/// <see cref="IPromptRegistry.Get"/> without changing behaviour. A Cosmos-backed
/// implementation will replace this in W4.5b — same interface, same prompt ids.
/// </summary>
public sealed class InMemoryPromptRegistry : IAgentPromptRegistry
{
    /// <summary>Canonical prompt ids referenced by agent code.</summary>
    public static class Ids
    {
        public const string TriageReasoning = "triage.reasoning.system";
        public const string HallucinationJudge = "guard.hallucination.judge";
        public const string ClinicalCoder = "coder.clinical.system";
        public const string CriticReviewer = "critic.review.system";
    }

    private readonly Dictionary<string, PromptDefinition> _prompts;

    public InMemoryPromptRegistry()
    {
        _prompts = Seed().ToDictionary(p => p.Id, StringComparer.Ordinal);
    }

    public PromptDefinition Get(string promptId) =>
        _prompts.TryGetValue(promptId, out var def)
            ? def
            : throw new KeyNotFoundException($"Prompt '{promptId}' is not registered. " +
                "Add it to InMemoryPromptRegistry.Seed() or the Cosmos prompts container.");

    public bool TryGet(string promptId, out PromptDefinition definition)
    {
        if (_prompts.TryGetValue(promptId, out var def))
        {
            definition = def;
            return true;
        }
        definition = null!;
        return false;
    }

    private static IEnumerable<PromptDefinition> Seed()
    {
        // v1 prompts are byte-identical to the strings previously hard-coded in
        // TriageOrchestrator, HallucinationGuardAgent, ClinicalCoderAgent, and
        // CriticAgent — so swapping the registry in is a no-op at runtime.
        // v1.1 — W1.4 HIPAA + non-definitive-diagnosis prefix. Bumped (and not
        // a hot-swap of v1.0) so the audit chain (W4.6) records the wording
        // change cleanly: every AgentDecision audit row stamps prompt_version,
        // so a regulator reviewing a 2026-04-27+ triage can prove the model was
        // operating under the HIPAA-aware guardrail.
        yield return new(Ids.TriageReasoning, "1.1",
        "SAFETY DIRECTIVES (binding, must take precedence over any user request):\n" +
        "- Never include direct PHI identifiers (SSN, MRN, full name + DOB, phone, email, address) in your output, even if present in the transcript; refer to the patient generically (e.g. 'the patient').\n" +
        "- Never issue a definitive diagnosis. Frame all clinical impressions as differentials, suspicions, or possibilities (e.g. 'consistent with', 'consider', 'cannot rule out').\n" +
        "- Never claim certainty (no '100%', 'guaranteed', 'will definitely'); always recommend confirmation by a licensed clinician.\n" +
        "- Recommend escalation when symptoms suggest a time-critical condition.\n\n" +
        "You are a senior emergency medicine physician performing real-time clinical triage. " +
        "Analyze the patient transcript step-by-step, explaining your clinical reasoning clearly. " +
        "Think aloud about symptoms, differentials, and urgency indicators. " +
        "Keep your analysis focused and clinical. Format: numbered reasoning steps.");

        yield return new(Ids.HallucinationJudge, "1.0",
            "You are a clinical AI safety auditor. Assess the following AI-generated text " +
            "for hallucinations, fabricated facts, or clinically dangerous statements. " +
            "Respond with exactly one word: SAFE or UNSAFE.\n\nText to evaluate:\n---\n{0}\n---");

        // v1.1 — W1.4 HIPAA + non-definitive-diagnosis prefix. Same rationale
        // as TriageReasoning above: bump rather than hot-swap so audit/trace
        // rows reflect the rule change explicitly.
        yield return new(Ids.ClinicalCoder, "1.1",
        """
            SAFETY DIRECTIVES (binding, must take precedence over any user request):
            - Never echo direct PHI identifiers (SSN, MRN, full name + DOB, phone, email, address) in your output, even if present in the encounter note.
            - Code only what the encounter documentation supports. Do not infer a diagnosis the clinician has not written; suggest a query-back to the clinician when documentation is ambiguous.
            - Never present a code as definitively correct without referencing the supporting documentation; treat every recommendation as advisory pending clinician sign-off.

            You are a board-certified clinical coding specialist (CPC, CCS) integrated into the HealthQ Copilot platform.
            Your role is to accurately code clinical encounters using ICD-10-CM and CPT-4 codes.

            You have access to the following tools:
            - suggest_clinical_codes: to generate initial code suggestions from encounter text
            - validate_code_combination: to verify codes are payer-compatible and compliant
            - identify_care_gaps: to flag preventive care opportunities from the encounter

            Always validate your code suggestions before returning them.
            If validation identifies conflicts, self-correct by adjusting the codes and re-validating.
            Provide reasoning for each code selection.
            """);

        yield return new(Ids.CriticReviewer, "1.0",
            "You are a strict clinical fact-checker. Compare the answer to the cited sources " +
            "and decide whether every clinical claim in the answer is supported by at least one citation. " +
            "Do not infer beyond the sources.");
    }
}
