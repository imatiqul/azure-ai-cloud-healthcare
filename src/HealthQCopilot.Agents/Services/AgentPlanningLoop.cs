using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Domain.Agents;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// Explicit Act → Observe → Reflect agentic planning loop.
///
/// Each iteration:
///   1. Act    — invoke the kernel with auto function-choice (SK picks tools dynamically)
///   2. Observe — inspect the tool call results and model output
///   3. Reflect — decide whether the goal is achieved or another iteration is needed
///
/// Termination conditions:
///   • Goal achieved (reflection returns "GOAL_MET")
///   • Maximum iterations reached (<see cref="MaxIterations"/>)
///   • Hallucination guard rejects output at any step
///
/// The loop records a <see cref="AgentDecision"/> per iteration and persists the
/// full reasoning chain for clinical auditability.
/// </summary>
public sealed class AgentPlanningLoop
{
    private const int MaxIterations = 5;

    private readonly Kernel _kernel;
    private readonly HallucinationGuardAgent _guard;
    private readonly AgentDbContext _db;
    private readonly ILogger<AgentPlanningLoop> _logger;

    public AgentPlanningLoop(
        Kernel kernel,
        HallucinationGuardAgent guard,
        AgentDbContext db,
        ILogger<AgentPlanningLoop> logger)
    {
        _kernel = kernel;
        _guard = guard;
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Executes the agentic loop for a clinical goal, returning the final composed answer
    /// and a trace of all reasoning steps.
    /// </summary>
    /// <param name="workflowId">The parent workflow for audit linkage.</param>
    /// <param name="agentName">Name of the calling agent (e.g., "ClinicalCoderAgent").</param>
    /// <param name="systemPrompt">Role + goal definition for the agent.</param>
    /// <param name="userGoal">The concrete clinical goal to achieve.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task<PlanningLoopResult> RunAsync(
        Guid workflowId,
        string agentName,
        string systemPrompt,
        string userGoal,
        CancellationToken ct = default)
    {
        var history = new ChatHistory();
        history.AddSystemMessage(systemPrompt);
        history.AddUserMessage(userGoal);

        var reasoningSteps = new List<string>();
        string finalAnswer = string.Empty;
        int iteration = 0;
        bool goalMet = false;

        IChatCompletionService? chat = null;
        try { chat = _kernel.GetRequiredService<IChatCompletionService>(); }
        catch
        {
            _logger.LogWarning("AgentPlanningLoop [{Agent}]: no LLM configured — returning goal as-is", agentName);
            return new PlanningLoopResult(userGoal, [userGoal], Iterations: 0, GoalMet: false);
        }

        // Auto function choice: SK will invoke tools dynamically based on context
        var settings = new OpenAIPromptExecutionSettings
        {
            FunctionChoiceBehavior = FunctionChoiceBehavior.Auto(),
            MaxTokens = 1024,
            Temperature = 0.1,
        };

        while (iteration < MaxIterations && !goalMet)
        {
            iteration++;
            _logger.LogInformation(
                "AgentPlanningLoop [{Agent}] iteration {N}/{Max} for workflow {WorkflowId}",
                agentName, iteration, MaxIterations, workflowId);

            var start = DateTime.UtcNow;

            try
            {
                // ── Act ──────────────────────────────────────────────────────────
                var response = await chat.GetChatMessageContentAsync(
                    history,
                    settings,
                    _kernel,
                    ct);

                var output = response.Content ?? string.Empty;

                // ── Observe ──────────────────────────────────────────────────────
                var guardVerdict = await _guard.EvaluateAsync(output, ct);
                if (!guardVerdict.IsSafe)
                {
                    _logger.LogWarning(
                        "AgentPlanningLoop [{Agent}] iteration {N}: guard rejected output. Findings: {Findings}",
                        agentName, iteration, string.Join(", ", guardVerdict.Findings));
                    reasoningSteps.Add($"[GUARD REJECTED] {string.Join("; ", guardVerdict.Findings)}");
                    break;
                }

                history.AddAssistantMessage(output);
                reasoningSteps.Add($"[Iter {iteration}] {output}");

                var latency = DateTime.UtcNow - start;
                var decision = AgentDecision.Create(
                    workflowId, agentName,
                    input: $"[{iteration}] {userGoal}",
                    output: output,
                    isGuardApproved: true,
                    latency);
                _db.AgentDecisions.Add(decision);

                // ── Reflect ──────────────────────────────────────────────────────
                // Ask the model if the original goal has been fully answered
                if (iteration < MaxIterations)
                {
                    var reflectPrompt =
                        $"""
                        ORIGINAL GOAL: {userGoal}

                        CURRENT ANSWER: {output}

                        Has the original goal been completely and accurately addressed?
                        Reply with exactly one word: GOAL_MET or CONTINUE.
                        """;

                    var reflectSettings = new OpenAIPromptExecutionSettings
                    {
                        MaxTokens = 10,
                        Temperature = 0.0,
                    };
                    var reflectHistory = new ChatHistory();
                    reflectHistory.AddSystemMessage("You are a goal evaluation assistant.");
                    reflectHistory.AddUserMessage(reflectPrompt);

                    var reflectResponse = await chat.GetChatMessageContentAsync(
                        reflectHistory, reflectSettings, cancellationToken: ct);

                    var reflectText = (reflectResponse.Content ?? "CONTINUE").Trim().ToUpperInvariant();
                    goalMet = reflectText.Contains("GOAL_MET");
                }
                else
                {
                    goalMet = true; // max iterations — accept current answer
                }

                finalAnswer = output;

                // Feed iteration result back for next act cycle
                if (!goalMet)
                {
                    history.AddUserMessage(
                        "The goal has not yet been fully achieved. Continue working toward a complete answer.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "AgentPlanningLoop [{Agent}] iteration {N} failed", agentName, iteration);
                break;
            }
        }

        await _db.SaveChangesAsync(ct);

        return new PlanningLoopResult(finalAnswer, reasoningSteps, iteration, goalMet);
    }
}

/// <summary>Result of an agentic planning loop execution.</summary>
public sealed record PlanningLoopResult(
    string FinalAnswer,
    IReadOnlyList<string> ReasoningSteps,
    int Iterations,
    bool GoalMet);
