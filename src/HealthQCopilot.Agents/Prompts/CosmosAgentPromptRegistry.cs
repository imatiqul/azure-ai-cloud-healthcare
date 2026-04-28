using System.Collections.Concurrent;
using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Agents.Prompts;

/// <summary>
/// W4.5b — Cosmos-backed <see cref="IAgentPromptRegistry"/> that lazily loads
/// prompt definitions from a versioned container and falls back to an inner
/// in-memory seed (<see cref="InMemoryPromptRegistry"/>) on miss or storage
/// failure. The interface is synchronous (callers like <c>TriageOrchestrator</c>
/// resolve a prompt during a request without paying async overhead), so this
/// implementation primes a process-wide dictionary on first hit per id and
/// caches it for the configured TTL — refreshed lazily on the next miss past
/// expiry. Storage failures never break the LLM request path; we log and
/// delegate to the inner registry, which guarantees a usable prompt at all
/// times.
///
/// Container schema (shared with <c>HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry</c>):
///   - partition key: <c>/promptKey</c>
///   - id: <c>{promptKey}:default:{version}</c>
///   - active=true; newest version wins.
/// Tenant overrides are reserved for the older async <c>IPromptRegistry</c>
/// (which serves runtime tenant-specific prompts); <see cref="IAgentPromptRegistry"/>
/// is platform-wide so we always read the <c>"default"</c> tenant row.
/// </summary>
public sealed class CosmosAgentPromptRegistry : IAgentPromptRegistry
{
    private static readonly TimeSpan EntryTtl = TimeSpan.FromMinutes(5);

    private readonly Container _container;
    private readonly IAgentPromptRegistry _inner;
    private readonly ILogger<CosmosAgentPromptRegistry> _logger;
    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.Ordinal);

    public CosmosAgentPromptRegistry(
        Container container,
        IAgentPromptRegistry inner,
        ILogger<CosmosAgentPromptRegistry> logger)
    {
        _container = container;
        _inner = inner;
        _logger = logger;
    }

    public PromptDefinition Get(string promptId)
    {
        if (TryGet(promptId, out var def)) return def;
        // Final fallback — inner registry will throw KeyNotFoundException for
        // truly unknown ids, matching the InMemoryPromptRegistry contract.
        return _inner.Get(promptId);
    }

    public bool TryGet(string promptId, out PromptDefinition definition)
    {
        if (_cache.TryGetValue(promptId, out var entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
        {
            definition = entry.Definition;
            return true;
        }

        // Miss / expired — try Cosmos. Sync wait is acceptable: callers (orchestrators)
        // resolve prompts at request entry, before any LLM call; the cache absorbs
        // the cost on subsequent hits. Cosmos failure or miss falls through to inner.
        try
        {
            var loaded = TryLoadFromCosmosAsync(promptId, CancellationToken.None).GetAwaiter().GetResult();
            if (loaded is not null)
            {
                _cache[promptId] = new CacheEntry(loaded, DateTimeOffset.UtcNow + EntryTtl);
                definition = loaded;
                return true;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Cosmos prompt lookup failed for {PromptId}; falling back to in-memory registry",
                promptId);
        }

        return _inner.TryGet(promptId, out definition);
    }

    private async Task<PromptDefinition?> TryLoadFromCosmosAsync(string promptId, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT TOP 1 * FROM c WHERE c.promptKey = @k AND c.tenantId = @t AND c.active = true ORDER BY c.version DESC")
            .WithParameter("@k", promptId)
            .WithParameter("@t", "default");

        using var iterator = _container.GetItemQueryIterator<PromptDoc>(
            query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(promptId),
                MaxItemCount = 1,
            });

        while (iterator.HasMoreResults)
        {
            FeedResponse<PromptDoc> page;
            try
            {
                page = await iterator.ReadNextAsync(ct);
            }
            catch (CosmosException cex) when (cex.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
            foreach (var doc in page)
            {
                return new PromptDefinition(doc.promptKey, doc.version.ToString("0.0"), doc.body);
            }
        }
        return null;
    }

    private readonly record struct CacheEntry(PromptDefinition Definition, DateTimeOffset ExpiresAt);

    /// <summary>Cosmos document shape — public so tests can stub the typed feed iterator.</summary>
    public sealed record PromptDoc(
        string id,
        string promptKey,
        string tenantId,
        int version,
        string body,
        bool active);
}
