using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.AI;

namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Background service that ingests clinical knowledge documents into Qdrant on startup,
/// and refreshes the collection on a configurable schedule.
///
/// Chunking strategy: fixed-size sliding window — 1000 chars per chunk, 150-char overlap.
/// Embedding model: Azure OpenAI text-embedding-ada-002 (1536 dims).
///
/// The service is idempotent — it checks HasDocumentsAsync() and skips if the
/// collection is already populated. Force re-ingestion by deleting the Qdrant collection.
/// </summary>
public sealed class KnowledgeIngestionService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<KnowledgeIngestionService> _logger;
    private readonly TimeSpan _refreshInterval;

    private const int ChunkSize = 1000;
    private const int ChunkOverlap = 150;

    public KnowledgeIngestionService(
        IServiceScopeFactory scopeFactory,
        ILogger<KnowledgeIngestionService> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _refreshInterval = TimeSpan.FromHours(
            configuration.GetValue("Qdrant:RefreshIntervalHours", 24));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait briefly to let other services start
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await IngestAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "KnowledgeIngestionService: ingestion failed; will retry after {Interval}", _refreshInterval);
            }

            await Task.Delay(_refreshInterval, stoppingToken);
        }
    }

    // ── Ingestion logic ────────────────────────────────────────────────────────

    private async Task IngestAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();

        var store = scope.ServiceProvider.GetService<IClinicalKnowledgeStore>();
        var embeddingGenerator = scope.ServiceProvider.GetService<IEmbeddingGenerator<string, Embedding<float>>>();

        if (store is null || embeddingGenerator is null)
        {
            _logger.LogWarning(
                "KnowledgeIngestionService: Qdrant or embedding service unavailable — skipping RAG ingestion");
            return;
        }

        // Ensure the Qdrant collection exists
        if (store is QdrantKnowledgeStore qdrantStore)
        {
            await qdrantStore.EnsureCollectionAsync(ct);
        }

        // Ensure the episodic memory collection exists
        var episodicMemory = scope.ServiceProvider.GetService<IEpisodicMemoryService>();
        if (episodicMemory is EpisodicMemoryService em)
        {
            await em.EnsureCollectionAsync(ct);
        }

        if (await store.HasDocumentsAsync(ct))
        {
            _logger.LogInformation("KnowledgeIngestionService: collection already populated — skipping seed ingestion");
            return;
        }

        _logger.LogInformation("KnowledgeIngestionService: starting clinical knowledge base ingestion...");
        var totalChunks = 0;

        foreach (var (source, category, text) in SeedClinicalDocuments.GetAll())
        {
            var chunks = ChunkText(text, source, category);

            foreach (var chunk in chunks)
            {
                ct.ThrowIfCancellationRequested();

                var embeddings = await embeddingGenerator.GenerateAsync([chunk.Text], cancellationToken: ct);
                var embeddingArray = embeddings[0].Vector.ToArray();

                await store.UpsertAsync(new KnowledgeChunk
                {
                    Id       = chunk.Id,
                    Text     = chunk.Text,
                    Source   = chunk.Source,
                    Category = chunk.Category,
                    Embedding = embeddingArray,
                }, ct);
                totalChunks++;
            }
        }

        _logger.LogInformation("KnowledgeIngestionService: ingested {Count} chunks into clinical-kb", totalChunks);
    }

    // ── Chunking ───────────────────────────────────────────────────────────────

    private static List<KnowledgeChunk> ChunkText(string text, string source, string category)
    {
        var chunks = new List<KnowledgeChunk>();
        var normalized = text.Trim();

        if (normalized.Length <= ChunkSize)
        {
            chunks.Add(MakeChunk(normalized, source, category, 0));
            return chunks;
        }

        var start = 0;
        var chunkIndex = 0;
        while (start < normalized.Length)
        {
            var end = Math.Min(start + ChunkSize, normalized.Length);

            // Try to break at a sentence boundary
            if (end < normalized.Length)
            {
                var breakAt = normalized.LastIndexOfAny(['.', '\n'], end, Math.Min(150, end - start));
                if (breakAt > start) end = breakAt + 1;
            }

            var chunkText = normalized[start..end].Trim();
            if (!string.IsNullOrWhiteSpace(chunkText))
            {
                chunks.Add(MakeChunk(chunkText, source, category, chunkIndex++));
            }

            start = end - ChunkOverlap;
            if (start >= normalized.Length) break;
        }

        return chunks;
    }

    private static KnowledgeChunk MakeChunk(string text, string source, string category, int index)
    {
        var id = DeterministicId($"{source}:{index}:{text[..Math.Min(64, text.Length)]}");
        return new KnowledgeChunk
        {
            Id       = id,
            Text     = text,
            Source   = source,
            Category = category,
            Embedding = [],
        };
    }

    private static string DeterministicId(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        // Format as UUID v4 string (deterministic, not truly random)
        return new Guid(hash[..16]).ToString();
    }
}
