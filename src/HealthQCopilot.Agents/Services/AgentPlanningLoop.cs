using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Metrics;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.FeatureManagement;
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
///   • Budget exhausted — max iterations / total tokens / wall-clock — enforced
///     centrally by <see cref="AgentBudgetTracker"/> (W2.6); on exhaustion the
///     loop returns the partial result with the matching outcome label
///     (<c>budget_max_iterations</c> / <c>budget_max_tokens</c> /
///     <c>budget_max_wall_clock</c>) so callers never see a 500.
///   • Hallucination guard rejects output at any step
///
/// The loop records a <see cref="AgentDecision"/> per iteration and persists the
/// full reasoning chain for clinical auditability.
/// </summary>
public sealed class AgentPlanningLoop
{
    private readonly Kernel _kernel;
    private readonly HallucinationGuardAgent _guard;
    private readonly AgentDbContext _db;
    private readonly IEpisodicMemoryService _episodicMemory;
    private readonly IFeatureManager _features;
    private readonly BusinessMetrics _metrics;
    private readonly AgentBudgetTracker _budget;
    private readonly IAgentSessionCancellationRegistry _cancellation;
    private readonly ILogger<AgentPlanningLoop> _logger;

    public AgentPlanningLoop(
        Kernel kernel,
        HallucinationGuardAgent guard,
        AgentDbContext db,
        IEpisodicMemoryService episodicMemory,
        IFeatureManager features,
        BusinessMetrics metrics,
        AgentBudgetTracker budget,
        IAgentSessionCancellationRegistry cancellation,
        ILogger<AgentPlanningLoop> logger)
    {
        _kernel = kernel;
        _guard = guard;
        _db = db;
        _episodicMemory = episodicMemory;
        _features = features;
        _metrics = metrics;
        _budget = budget;
        _cancellation = cancellation;
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
        // W5.6 — register a session-keyed CTS so POST /api/v1/agents/sessions/{id}/cancel
        // can trip the loop at the next yield. Linked to the inbound HTTP ct so a
        // client disconnect still aborts the loop too. Disposed in the finally
        // block at end of method to guarantee registry hygiene.
        var sessionId = workflowId.ToString();
        using var sessionCts = _cancellation.Register(sessionId, ct);
        ct = sessionCts.Token;

        var history = new ChatHistory();
        history.AddSystemMessage(systemPrompt);

        // W5.2 — tag the kernel with session/agent identifiers so the
        // LiveToolEventFilter can publish ToolInvoked/ToolCompleted events
        // to the correct Web PubSub session group.
        _kernel.Data["sessionId"] = workflowId.ToString();
        _kernel.Data["agentName"] = agentName;

        // W2.5 — Episodic memory: prepend top-K similar past accepted decisions
        // as in-context few-shots so the agent learns from its own history without
        // fine-tuning. Gated behind HealthQ:AgentHandoff (same orchestration flag).
        if (await _features.IsEnabledAsync(HealthQFeatures.AgentHandoff))
        {
            try
            {
                var recall = await _episodicMemory.RecallSimilarDecisionsAsync(userGoal, topK: 3, ct);
                if (!string.IsNullOrWhiteSpace(recall))
                {
                    history.AddSystemMessage(
                        "Relevant prior accepted decisions for similar cases (use only as context, never copy verbatim):\n" + recall);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "AgentPlanningLoop [{Agent}]: episodic recall failed — continuing without it", agentName);
            }
        }

        history.AddUserMessage(userGoal);

        var reasoningSteps = new List<string>();
        string finalAnswer = string.Empty;
        int iteration = 0;
        bool goalMet = false;
        string outcome = "error";
        var loopStart = System.Diagnostics.Stopwatch.StartNew();

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

        while (!goalMet)
        {
            // W2.6 — enforce budget BEFORE doing any more work this iteration so
            // a partial result still gets returned (200, never 500). Reason maps
            // 1:1 to the outcome label so the W4.3 latency histogram + dashboard
            // can break down exhaustion cause.
            if (_budget.IsExhausted(out var exhaustionReason))
            {
                _logger.LogWarning(
                    "AgentPlanningLoop [{Agent}] budget exhausted ({Reason}) after iteration {N} for workflow {WorkflowId}",
                    agentName, exhaustionReason, iteration, workflowId);
                reasoningSteps.Add($"[BUDGET EXHAUSTED] {exhaustionReason}");
                outcome = $"budget_{exhaustionReason.Replace('-', '_')}";
                break;
            }

            _budget.RecordIteration();
            iteration++;
            var remainingIterations = _budget.Snapshot().RemainingIterations;
            _logger.LogInformation(
                "AgentPlanningLoop [{Agent}] iteration {N} ({Remaining} remaining) for workflow {WorkflowId}",
                agentName, iteration, remainingIterations, workflowId);

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
                // W2.6 — charge the token budget. Extracted via reflection (matches
                // GuideOrchestrator pattern) so mock LLMs without Usage metadata
                // simply contribute 0 and exhaustion still trips on iterations/wall-clock.
                var (promptTokens, completionTokens) = ExtractTokenUsage(response);
                _budget.RecordTokens(promptTokens + completionTokens);
                // ── Observe ──────────────────────────────────────────────────────
                var guardVerdict = await _guard.EvaluateAsync(output, ct);
                if (!guardVerdict.IsSafe)
                {
                    _logger.LogWarning(
                        "AgentPlanningLoop [{Agent}] iteration {N}: guard rejected output. Findings: {Findings}",
                        agentName, iteration, string.Join(", ", guardVerdict.Findings));
                    reasoningSteps.Add($"[GUARD REJECTED] {string.Join("; ", guardVerdict.Findings)}");
                    outcome = "guard_rejected";
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
                // Ask the model if the original goal has been fully answered.
                // Skip when no iterations remain in the budget — we'd have to
                // accept the answer next loop pass anyway.
                if (_budget.Snapshot().RemainingIterations > 0)
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
                outcome = "error";
                break;
            }
        }

        if (outcome == "error")
            outcome = goalMet ? "goal_met" : outcome;

        // W4.3 — emit planning-loop latency histogram for SLO alerting (p99 > 5 s).
        loopStart.Stop();
        _metrics.AgentPlanningLoopMs.Record(
            loopStart.Elapsed.TotalMilliseconds,
            new KeyValuePair<string, object?>("agent", agentName),
            new KeyValuePair<string, object?>("outcome", outcome));

        await _db.SaveChangesAsync(ct);

        // W2.5 — persist the final decision to episodic memory so future runs can
        // recall it. Only stores when the loop produced an answer.
        if (!string.IsNullOrWhiteSpace(finalAnswer)
            && await _features.IsEnabledAsync(HealthQFeatures.AgentHandoff))
        {
            _ = _episodicMemory.StoreDecisionAsync(agentName, userGoal, finalAnswer, guardApproved: goalMet, ct);
        }

        return new PlanningLoopResult(finalAnswer, reasoningSteps, iteration, goalMet);
    }

    /// <summary>
    /// W2.6 — extract prompt + completion token counts from SK
    /// <see cref="ChatMessageContent"/> metadata. Reflection-based to avoid a
    /// hard compile-time dep on the OpenAI SDK type. Returns (0, 0) when
    /// metadata is absent (mock LLMs / streaming).
    /// </summary>
    private static (int PromptTokens, int CompletionTokens) ExtractTokenUsage(ChatMessageContent? msg)
    {
        if (msg?.Metadata?.TryGetValue("Usage", out var usageObj) != true || usageObj is null)
            return (0, 0);

        var t = usageObj.GetType();
        var input = t.GetProperty("InputTokenCount")?.GetValue(usageObj) as int? ?? 0;
        var output = t.GetProperty("OutputTokenCount")?.GetValue(usageObj) as int? ?? 0;
        return (input, output);
    }
}

/// <summary>Result of an agentic planning loop execution.</summary>
public sealed record PlanningLoopResult(
    string FinalAnswer,
    IReadOnlyList<string> ReasoningSteps,
    int Iterations,
    bool GoalMet);
