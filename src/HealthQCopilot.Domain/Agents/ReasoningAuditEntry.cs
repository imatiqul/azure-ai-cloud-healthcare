using System.Text.Json;
using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Agents;

/// <summary>
/// Stores the XAI reasoning audit trail for an agent decision.
///
/// Links a <see cref="AgentDecision"/> to:
///   - The specific RAG knowledge chunks that were retrieved to inform it
///   - The step-by-step reasoning chain from the agentic planning loop
///   - The hallucination guard verdict and confidence score
///
/// Required for:
///   - FDA 21 CFR Part 11 / ONC HTI-1 AI explainability obligations
///   - Clinical audit: clinician can see WHY the AI recommended a code or triage level
///   - Regulatory submissions proving non-biased AI decision-making
/// </summary>
public sealed class ReasoningAuditEntry : Entity<Guid>
{
    public Guid AgentDecisionId { get; private set; }
    public string AgentName { get; private set; } = string.Empty;

    /// <summary>JSON array of Qdrant chunk UUIDs retrieved for this decision.</summary>
    public string RagChunkIdsJson { get; private set; } = "[]";

    /// <summary>JSON array of reasoning step strings from the planning loop.</summary>
    public string ReasoningStepsJson { get; private set; } = "[]";

    /// <summary>"SAFE" or "REJECTED" with findings if applicable.</summary>
    public string GuardVerdict { get; private set; } = string.Empty;

    /// <summary>Confidence score 0.0–1.0 from the LLM or derived from model probability.</summary>
    public double ConfidenceScore { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private ReasoningAuditEntry() { }

    public static ReasoningAuditEntry Create(
        Guid agentDecisionId,
        string agentName,
        IReadOnlyList<string> ragChunkIds,
        IReadOnlyList<string> reasoningSteps,
        string guardVerdict,
        double confidenceScore)
    {
        return new ReasoningAuditEntry
        {
            Id               = Guid.NewGuid(),
            AgentDecisionId  = agentDecisionId,
            AgentName        = agentName,
            RagChunkIdsJson  = JsonSerializer.Serialize(ragChunkIds),
            ReasoningStepsJson = JsonSerializer.Serialize(reasoningSteps),
            GuardVerdict     = guardVerdict,
            ConfidenceScore  = Math.Clamp(confidenceScore, 0.0, 1.0),
            CreatedAt        = DateTime.UtcNow,
        };
    }

    public IReadOnlyList<string> GetRagChunkIds()
        => JsonSerializer.Deserialize<List<string>>(RagChunkIdsJson) ?? [];

    public IReadOnlyList<string> GetReasoningSteps()
        => JsonSerializer.Deserialize<List<string>>(ReasoningStepsJson) ?? [];
}
