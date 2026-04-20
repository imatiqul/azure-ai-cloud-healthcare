using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Domain.Agents;
using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// Specialized agent for LLM-powered clinical coding using the Act → Observe → Reflect loop.
///
/// Replaces <c>CodeSuggestionService</c>'s keyword matching with a Semantic Kernel agent
/// that uses <see cref="ClinicalCoderPlugin"/> tools dynamically, enriched with RAG context
/// from clinical coding guidelines stored in Qdrant.
///
/// The agent:
///   1. Decomposes the coding task into sub-goals (code suggestion + validation)
///   2. Calls <c>suggest_clinical_codes</c> via the planning loop
///   3. Calls <c>validate_code_combination</c> to check payer compatibility
///   4. Self-corrects if the initial codes are flagged as invalid
///   5. Returns an auditable coding decision with confidence scores and reasoning trail
/// </summary>
public sealed class ClinicalCoderAgent
{
    private readonly AgentPlanningLoop _loop;
    private readonly Kernel _kernel;
    private readonly AgentDbContext _db;
    private readonly ILogger<ClinicalCoderAgent> _logger;

    private const string SystemPrompt =
        """
        You are a board-certified clinical coding specialist (CPC, CCS) integrated into the HealthQ Copilot platform.
        Your role is to accurately code clinical encounters using ICD-10-CM and CPT-4 codes.

        You have access to the following tools:
        - suggest_clinical_codes: to generate initial code suggestions from encounter text
        - validate_code_combination: to verify codes are payer-compatible and compliant
        - identify_care_gaps: to flag preventive care opportunities from the encounter

        Always validate your code suggestions before returning them.
        If validation identifies conflicts, self-correct by adjusting the codes and re-validating.
        Provide reasoning for each code selection.
        """;

    public ClinicalCoderAgent(
        AgentPlanningLoop loop,
        Kernel kernel,
        AgentDbContext db,
        ILogger<ClinicalCoderAgent> logger)
    {
        _loop = loop;
        _kernel = kernel;
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Codes a clinical encounter using the agentic planning loop.
    /// </summary>
    /// <param name="workflowId">The parent triage workflow ID for audit linkage.</param>
    /// <param name="encounterTranscript">Free-text encounter transcript or summary.</param>
    /// <param name="payer">Payer name for code compatibility validation.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task<ClinicalCodingResult> CodeEncounterAsync(
        Guid workflowId,
        string encounterTranscript,
        string payer = "Medicare",
        CancellationToken ct = default)
    {
        _logger.LogInformation(
            "ClinicalCoderAgent: starting coding for workflow {WorkflowId}, payer {Payer}",
            workflowId, payer);

        var goal =
            $"""
            Code the following clinical encounter for payer '{payer}'.
            First, suggest appropriate ICD-10-CM and CPT-4 codes.
            Then validate the code combination for {payer} compliance.
            If any conflicts are found, correct the codes and re-validate.

            ENCOUNTER:
            {encounterTranscript}
            """;

        var loopResult = await _loop.RunAsync(
            workflowId,
            agentName: "ClinicalCoderAgent",
            systemPrompt: SystemPrompt,
            userGoal: goal,
            ct);

        _logger.LogInformation(
            "ClinicalCoderAgent: completed in {Iterations} iterations, goalMet={GoalMet}",
            loopResult.Iterations, loopResult.GoalMet);

        return new ClinicalCodingResult(
            WorkflowId: workflowId,
            FinalAnswer: loopResult.FinalAnswer,
            ReasoningSteps: loopResult.ReasoningSteps,
            Iterations: loopResult.Iterations,
            GoalAchieved: loopResult.GoalMet,
            Payer: payer,
            CodingAgentVersion: "ClinicalCoderAgent-v1.0");
    }
}

/// <summary>Represents the output of a clinical coding agent invocation.</summary>
public sealed record ClinicalCodingResult(
    Guid WorkflowId,
    string FinalAnswer,
    IReadOnlyList<string> ReasoningSteps,
    int Iterations,
    bool GoalAchieved,
    string Payer,
    string CodingAgentVersion);
