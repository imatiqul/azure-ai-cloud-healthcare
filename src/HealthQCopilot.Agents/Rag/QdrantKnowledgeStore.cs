using Qdrant.Client;
using Qdrant.Client.Grpc;

namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Qdrant-backed clinical knowledge store.
///
/// Collection: "clinical-kb"
/// Vector size: 1536 (text-embedding-ada-002 / text-embedding-3-small)
/// Distance metric: Cosine
///
/// Each point payload:
///   { "text": "...", "source": "...", "category": "..." }
/// </summary>
public sealed class QdrantKnowledgeStore : IClinicalKnowledgeStore
{
    private const string CollectionName = "clinical-kb";
    private const uint VectorSize = 1536;

    private readonly QdrantClient _client;
    private readonly ILogger<QdrantKnowledgeStore> _logger;

    public QdrantKnowledgeStore(QdrantClient client, ILogger<QdrantKnowledgeStore> logger)
    {
        _client = client;
        _logger = logger;
    }

    // ── Ensure collection exists ───────────────────────────────────────────────

    public async Task EnsureCollectionAsync(CancellationToken ct = default)
    {
        var collections = await _client.ListCollectionsAsync(ct);
        if (collections.Any(c => c == CollectionName)) return;

        await _client.CreateCollectionAsync(
            CollectionName,
            new VectorParams { Size = VectorSize, Distance = Distance.Cosine },
            cancellationToken: ct);

        _logger.LogInformation("QdrantKnowledgeStore: created collection '{Collection}'", CollectionName);
    }

    // ── Upsert ─────────────────────────────────────────────────────────────────

    public async Task UpsertAsync(KnowledgeChunk chunk, CancellationToken ct = default)
    {
        var point = new PointStruct
        {
            Id = new PointId { Uuid = chunk.Id },
            Vectors = chunk.Embedding,
            Payload =
            {
                ["text"]     = chunk.Text,
                ["source"]   = chunk.Source,
                ["category"] = chunk.Category,
            }
        };

        await _client.UpsertAsync(CollectionName, [point], cancellationToken: ct);
    }

    // ── Search ─────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<KnowledgeChunk>> SearchAsync(
        float[] queryEmbedding, int topK = 4, float minScore = 0.72f, CancellationToken ct = default)
    {
        var results = await _client.SearchAsync(
            CollectionName,
            queryEmbedding,
            limit: (ulong)topK,
            scoreThreshold: minScore,
            cancellationToken: ct);

        return results.Select(r => new KnowledgeChunk
        {
            Id = r.Id.Uuid,
            Text = r.Payload.GetValueOrDefault("text")?.StringValue ?? string.Empty,
            Source = r.Payload.GetValueOrDefault("source")?.StringValue ?? string.Empty,
            Category = r.Payload.GetValueOrDefault("category")?.StringValue ?? string.Empty,
            Embedding = [],  // not returned from search result
        }).ToList();
    }

    // ── Count ──────────────────────────────────────────────────────────────────

    public async Task<bool> HasDocumentsAsync(CancellationToken ct = default)
    {
        try
        {
            var info = await _client.GetCollectionInfoAsync(CollectionName, ct);
            return info.PointsCount > 0;
        }
        catch
        {
            return false;
        }
    }
}
