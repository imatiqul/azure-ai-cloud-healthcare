using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.Extensions.AI;
using Microsoft.SemanticKernel.Embeddings;

namespace HealthQCopilot.Agents.Services;

/// <summary>
/// Clinician Feedback Service — RAG Knowledge Feedback Loop
///
/// Enables clinicians to rate AI-generated triage and guide responses
/// (thumbs-up / thumbs-down + optional free-text correction).
///
/// Positive feedback (rating ≥ 4):
///   The clinician's corrected text (or the original AI response if none)
///   is embedded and upserted into the Qdrant clinical knowledge base as a
///   "clinician-validated" chunk, boosting its retrieval rank in future RAG queries.
///
/// Negative feedback (rating ≤ 2):
///   The original AI response chunk is flagged for review by marking it in the
///   feedback log. A human KB curator can then delete or replace the chunk.
///   The corrected text (if provided) is immediately ingested as a replacement.
///
/// Neutral feedback (rating 3):
///   Logged but no Qdrant mutation.
///
/// All feedback is persisted to <see cref="ClinicianFeedbackRepository"/> for
/// audit trail, reporting, and automated bias/quality dashboards.
/// </summary>
public sealed class ClinicianFeedbackService(
    IClinicalKnowledgeStore knowledgeStore,
    IEmbeddingGenerator<string, Embedding<float>> embedder,
    ClinicianFeedbackRepository repository,
    BusinessMetrics metrics,
    ILogger<ClinicianFeedbackService> logger)
{
    /// <summary>
    /// Records clinician feedback for an AI response and optionally updates
    /// the Qdrant knowledge base.
    /// </summary>
    public async Task<ClinicianFeedbackResult> SubmitFeedbackAsync(
        ClinicianFeedbackInput input,
        CancellationToken ct = default)
    {
        var record = await repository.SaveAsync(input, ct);

        string action = "logged";

        // 2. Positive feedback → ingest corrected/approved content into Qdrant
        if (input.Rating >= 4)
        {
            var textToIngest = input.CorrectedText ?? input.OriginalAiResponse;
            if (!string.IsNullOrWhiteSpace(textToIngest))
            {
                try
                {
                    var embResult = await embedder.GenerateAsync([textToIngest], cancellationToken: ct);
                    var embedding = embResult[0].Vector;
                    var chunk = new KnowledgeChunk
                    {
                        Id = $"feedback:{record.Id}",
                        Text = textToIngest,
                        Source = $"clinician-feedback:{input.ClinicianId}",
                        Category = input.Category ?? "clinician-validated",
                        Embedding = embedding.ToArray()
                    };
                    await knowledgeStore.UpsertAsync(chunk, ct);
                    action = "ingested-into-qdrant";

                    logger.LogInformation(
                        "RAG feedback ingested: clinician={Clinician} session={Session} rating={Rating} chunkId={ChunkId}",
                        input.ClinicianId, input.SessionId, input.Rating, chunk.Id);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to ingest positive feedback into Qdrant");
                    action = "logged-qdrant-failed";
                }
            }
        }
        // 3. Negative feedback with correction → ingest replacement content
        else if (input.Rating <= 2 && !string.IsNullOrWhiteSpace(input.CorrectedText))
        {
            try
            {
                var embResult2 = await embedder.GenerateAsync([input.CorrectedText], cancellationToken: ct);
                var embedding2 = embResult2[0].Vector;
                var chunk = new KnowledgeChunk
                {
                    Id = $"feedback-correction:{record.Id}",
                    Text = input.CorrectedText,
                    Source = $"clinician-correction:{input.ClinicianId}",
                    Category = input.Category ?? "clinician-correction",
                    Embedding = embedding2.ToArray()
                };
                await knowledgeStore.UpsertAsync(chunk, ct);
                action = "correction-ingested";

                logger.LogWarning(
                    "RAG negative feedback + correction ingested: clinician={Clinician} session={Session} rating={Rating}",
                    input.ClinicianId, input.SessionId, input.Rating);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to ingest correction into Qdrant");
                action = "logged-qdrant-failed";
            }
        }

        metrics.AgentFeedbackTotal.Add(1,
            new KeyValuePair<string, object?>("sentiment", Sentiment(input.Rating)),
            new KeyValuePair<string, object?>("action", action));
        return new ClinicianFeedbackResult(record.Id, action, record.CreatedAt);
    }

    private static string Sentiment(int rating) =>
        rating >= 4 ? "positive" : (rating <= 2 ? "negative" : "neutral");

    /// <summary>
    /// Returns a summary of feedback statistics for model quality monitoring.
    /// </summary>
    public async Task<FeedbackSummaryResult> GetSummaryAsync(
        DateTime? since = null,
        CancellationToken ct = default)
        => await repository.GetSummaryAsync(since ?? DateTime.UtcNow.AddDays(-30), ct);
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>Clinician feedback submission payload.</summary>
public sealed record ClinicianFeedbackInput(
    /// <summary>Clinician or system user submitting the feedback.</summary>
    string ClinicianId,
    /// <summary>Triage / guide session ID for audit linkage.</summary>
    string SessionId,
    /// <summary>The original AI-generated response being rated.</summary>
    string OriginalAiResponse,
    /// <summary>Rating 1–5: 1=Strongly Disagree, 3=Neutral, 5=Strongly Agree.</summary>
    int Rating,
    /// <summary>Optional corrected text provided by the clinician.</summary>
    string? CorrectedText = null,
    /// <summary>Optional free-text comment.</summary>
    string? Comment = null,
    /// <summary>Knowledge category for ingested chunks (default: clinician-validated).</summary>
    string? Category = null);

public sealed record ClinicianFeedbackResult(
    Guid FeedbackId,
    string Action,        // logged | ingested-into-qdrant | correction-ingested | logged-qdrant-failed
    DateTime CreatedAt);

public sealed record FeedbackSummaryResult(
    int TotalFeedback,
    double AverageRating,
    int PositiveCount,    // rating >= 4
    int NegativeCount,    // rating <= 2
    int IngestedCount,    // chunks added to Qdrant
    DateTime PeriodStart,
    DateTime PeriodEnd);

// ── Lightweight in-process feedback repository ────────────────────────────────
// In production, replace with EF Core persistence to HealthQ DB.

public sealed class ClinicianFeedbackRepository(ILogger<ClinicianFeedbackRepository> logger)
{
    // In-memory store for demo; replace with DbContext in production
    private readonly List<FeedbackRecord> _records = [];

    public Task<FeedbackRecord> SaveAsync(ClinicianFeedbackInput input, CancellationToken ct)
    {
        var record = new FeedbackRecord(Guid.NewGuid(), input, DateTime.UtcNow);
        lock (_records) { _records.Add(record); }
        logger.LogDebug("Feedback saved id={Id} clinician={Clinician} rating={Rating}",
            record.Id, input.ClinicianId, input.Rating);
        return Task.FromResult(record);
    }

    public Task<FeedbackSummaryResult> GetSummaryAsync(DateTime since, CancellationToken ct)
    {
        List<FeedbackRecord> snapshot;
        lock (_records) { snapshot = _records.Where(r => r.CreatedAt >= since).ToList(); }

        int total = snapshot.Count;
        double avg = total > 0 ? snapshot.Average(r => r.Input.Rating) : 0;
        int positive = snapshot.Count(r => r.Input.Rating >= 4);
        int negative = snapshot.Count(r => r.Input.Rating <= 2);
        int ingested = snapshot.Count(r => r.Input.Rating >= 4 || (r.Input.Rating <= 2 && r.Input.CorrectedText != null));

        return Task.FromResult(new FeedbackSummaryResult(
            total, avg, positive, negative, ingested,
            since, DateTime.UtcNow));
    }
}

public sealed record FeedbackRecord(Guid Id, ClinicianFeedbackInput Input, DateTime CreatedAt);
