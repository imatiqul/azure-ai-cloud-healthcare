namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Abstraction over the vector store used for clinical knowledge retrieval.
/// Concrete implementation targets Qdrant v1.9; swap for any vector DB.
/// </summary>
public interface IClinicalKnowledgeStore
{
    /// <summary>
    /// Upsert a knowledge chunk with its embedding.
    /// </summary>
    Task UpsertAsync(KnowledgeChunk chunk, CancellationToken ct = default);

    /// <summary>
    /// Search for the top-K chunks most semantically similar to the query vector.
    /// </summary>
    Task<IReadOnlyList<KnowledgeChunk>> SearchAsync(
        float[] queryEmbedding, int topK = 4, float minScore = 0.72f, CancellationToken ct = default);

    /// <summary>True if the collection already contains documents (skip re-ingestion).</summary>
    Task<bool> HasDocumentsAsync(CancellationToken ct = default);
}

/// <summary>A single text chunk stored in the vector database.</summary>
public sealed class KnowledgeChunk
{
    public required string Id { get; init; }
    public required string Text { get; init; }
    public required string Source { get; init; }   // document filename / title
    public required string Category { get; init; } // "protocol", "guideline", "drug", "icd10"
    public required float[] Embedding { get; init; }
}
