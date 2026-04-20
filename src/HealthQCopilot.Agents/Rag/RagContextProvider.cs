using Microsoft.Extensions.AI;
using Microsoft.SemanticKernel.Embeddings;

namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Retrieves semantically relevant clinical context from the Qdrant knowledge base
/// to inject into Semantic Kernel prompts (RAG — Retrieval-Augmented Generation).
/// </summary>
public interface IRagContextProvider
{
    /// <summary>
    /// Embed <paramref name="query"/> and retrieve the top-K matching chunks from Qdrant.
    /// Returns a formatted string block ready for injection into a system prompt.
    /// Returns an empty string if Qdrant is unavailable.
    /// </summary>
    Task<string> GetRelevantContextAsync(string query, int topK = 4, CancellationToken ct = default);
}

public sealed class RagContextProvider : IRagContextProvider
{
    private readonly IClinicalKnowledgeStore _store;
    private readonly IEmbeddingGenerator<string, Embedding<float>> _embeddingService;
    private readonly ILogger<RagContextProvider> _logger;

    public RagContextProvider(
        IClinicalKnowledgeStore store,
        IEmbeddingGenerator<string, Embedding<float>> embeddingService,
        ILogger<RagContextProvider> logger)
    {
        _store = store;
        _embeddingService = embeddingService;
        _logger = logger;
    }

    public async Task<string> GetRelevantContextAsync(string query, int topK = 4, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return string.Empty;

        try
        {
            var embeddings = await _embeddingService.GenerateAsync([query], cancellationToken: ct);
            var vector = embeddings[0].Vector.ToArray();

            var chunks = await _store.SearchAsync(vector, topK, minScore: 0.70f, ct: ct);
            if (chunks.Count == 0) return string.Empty;

            var sb = new System.Text.StringBuilder();
            sb.AppendLine("--- RETRIEVED CLINICAL CONTEXT ---");
            foreach (var chunk in chunks)
            {
                sb.AppendLine($"[{chunk.Category.ToUpperInvariant()} | {chunk.Source}]");
                sb.AppendLine(chunk.Text);
                sb.AppendLine();
            }
            sb.AppendLine("--- END OF RETRIEVED CONTEXT ---");
            return sb.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "RagContextProvider: vector search failed — proceeding without RAG context");
            return string.Empty;
        }
    }
}
