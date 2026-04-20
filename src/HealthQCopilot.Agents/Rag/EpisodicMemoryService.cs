using Microsoft.Extensions.AI;
using Qdrant.Client;
using Qdrant.Client.Grpc;

namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Semantic / episodic memory store backed by Qdrant.
///
/// Stores agent decisions as embeddings in the <c>agent-episodic</c> collection,
/// enabling the planning loop to retrieve similar past decisions as in-context
/// examples before invoking the LLM.
///
/// This implements a form of retrieval-augmented in-context learning:
///   - When a new clinical case arrives, we retrieve the top-K similar historical
///     decisions (accepted by the guard) and include them as few-shot examples.
///   - Over time, the agent learns from its own accepted decisions without fine-tuning.
///
/// Rejected decisions are stored with a negative label so the model can also see
/// patterns it should avoid.
/// </summary>
public interface IEpisodicMemoryService
{
    /// <summary>Stores an agent decision as a searchable episodic memory.</summary>
    Task StoreDecisionAsync(
        string agentName,
        string input,
        string output,
        bool guardApproved,
        CancellationToken ct = default);

    /// <summary>
    /// Retrieves the top-K most similar past decisions for use as in-context examples.
    /// </summary>
    /// <returns>
    /// A formatted block of past accepted decisions, ready for injection into a prompt.
    /// Returns an empty string if the memory store is unavailable or empty.
    /// </returns>
    Task<string> RecallSimilarDecisionsAsync(string query, int topK = 3, CancellationToken ct = default);
}

public sealed class EpisodicMemoryService : IEpisodicMemoryService
{
    private const string CollectionName = "agent-episodic";
    private const uint VectorSize = 1536;

    private readonly QdrantClient _qdrant;
    private readonly IEmbeddingGenerator<string, Embedding<float>> _embedder;
    private readonly ILogger<EpisodicMemoryService> _logger;

    public EpisodicMemoryService(
        QdrantClient qdrant,
        IEmbeddingGenerator<string, Embedding<float>> embedder,
        ILogger<EpisodicMemoryService> logger)
    {
        _qdrant = qdrant;
        _embedder = embedder;
        _logger = logger;
    }

    // ── Initialization ─────────────────────────────────────────────────────────

    public async Task EnsureCollectionAsync(CancellationToken ct = default)
    {
        var collections = await _qdrant.ListCollectionsAsync(ct);
        if (collections.Any(c => c == CollectionName)) return;

        await _qdrant.CreateCollectionAsync(
            CollectionName,
            new VectorParams { Size = VectorSize, Distance = Distance.Cosine },
            cancellationToken: ct);

        _logger.LogInformation("EpisodicMemoryService: created collection '{Collection}'", CollectionName);
    }

    // ── Store ─────────────────────────────────────────────────────────────────

    public async Task StoreDecisionAsync(
        string agentName,
        string input,
        string output,
        bool guardApproved,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input)) return;

        try
        {
            // Embed the input text (the clinical scenario)
            var embeddings = await _embedder.GenerateAsync([input], cancellationToken: ct);
            var vector = embeddings[0].Vector.ToArray();

            var point = new PointStruct
            {
                Id = new PointId { Uuid = Guid.NewGuid().ToString() },
                Vectors = vector,
                Payload =
                {
                    ["agent_name"]     = agentName,
                    ["input"]          = input[..Math.Min(500, input.Length)],
                    ["output"]         = output[..Math.Min(500, output.Length)],
                    ["guard_approved"] = guardApproved.ToString(),
                    ["recorded_at"]    = DateTime.UtcNow.ToString("O"),
                }
            };

            await _qdrant.UpsertAsync(CollectionName, [point], cancellationToken: ct);

            _logger.LogDebug(
                "EpisodicMemoryService: stored decision for agent {Agent} (approved={Approved})",
                agentName, guardApproved);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EpisodicMemoryService: failed to store decision for agent {Agent}", agentName);
        }
    }

    // ── Recall ────────────────────────────────────────────────────────────────

    public async Task<string> RecallSimilarDecisionsAsync(string query, int topK = 3, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return string.Empty;

        try
        {
            var embeddings = await _embedder.GenerateAsync([query], cancellationToken: ct);
            var vector = embeddings[0].Vector.ToArray();

            // Only retrieve decisions approved by the hallucination guard (safe examples only)
            var filter = new Filter
            {
                Must =
                {
                    new Condition
                    {
                        Field = new FieldCondition
                        {
                            Key = "guard_approved",
                            Match = new Match { Text = "True" }
                        }
                    }
                }
            };

            var results = await _qdrant.SearchAsync(
                CollectionName,
                vector,
                filter: filter,
                limit: (ulong)topK,
                scoreThreshold: 0.75f,
                cancellationToken: ct);

            if (results.Count == 0) return string.Empty;

            var sb = new System.Text.StringBuilder();
            sb.AppendLine("--- SIMILAR PAST CLINICAL DECISIONS (episodic memory) ---");
            foreach (var r in results)
            {
                var agent = r.Payload.GetValueOrDefault("agent_name")?.StringValue ?? "unknown";
                var pastInput = r.Payload.GetValueOrDefault("input")?.StringValue ?? string.Empty;
                var pastOutput = r.Payload.GetValueOrDefault("output")?.StringValue ?? string.Empty;
                sb.AppendLine($"[{agent} | similarity={r.Score:F2}]");
                sb.AppendLine($"SCENARIO: {pastInput}");
                sb.AppendLine($"DECISION: {pastOutput}");
                sb.AppendLine();
            }
            sb.AppendLine("--- END EPISODIC MEMORY ---");
            return sb.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EpisodicMemoryService: recall failed — proceeding without episodic context");
            return string.Empty;
        }
    }
}
