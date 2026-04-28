using System.Net;
using HealthQCopilot.Infrastructure.Caching;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// W4.5 — Cosmos-backed <see cref="IPromptRegistry"/> that resolves prompts from
/// a versioned container, falling back to the inner App-Config-based registry on miss
/// or storage failure. Documents are partitioned by <c>/promptKey</c> and addressed by
/// <c>id = "{promptKey}:{tenantId}:{version}"</c> (with <c>tenantId = "default"</c>
/// for the platform-wide pin).
///
/// Resolution order:
///   1. Cached result (Redis, 10 min for tenant overrides, 5 min for defaults).
///   2. Cosmos doc for (promptKey, tenantId, active=true) — newest version wins.
///   3. Cosmos doc for (promptKey, tenantId="default", active=true).
///   4. Inner registry (App Configuration overrides → hardcoded default).
///
/// Storage failures never break the LLM request path; we log + delegate to the inner
/// registry, which guarantees a usable prompt at all times.
/// </summary>
public sealed class CosmosPromptRegistry(
    Container container,
    IPromptRegistry inner,
    ICacheService cache,
    ILogger<CosmosPromptRegistry> logger) : IPromptRegistry, IPromptRegistryAdmin
{
    private static readonly TimeSpan TenantOverrideTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(5);

    public async Task<string> GetPromptAsync(
        string promptKey,
        string tenantId,
        string hardcodedDefault,
        CancellationToken ct = default)
    {
        var cacheKey = $"prompt:{tenantId}:{promptKey}";
        var cached = await cache.GetAsync<string>(cacheKey, ct);
        if (cached is not null)
            return cached;

        try
        {
            var hit = await TryLoadAsync(promptKey, tenantId, ct)
                   ?? await TryLoadAsync(promptKey, "default", ct);
            if (hit is not null)
            {
                var ttl = string.Equals(hit.TenantId, "default", StringComparison.Ordinal)
                    ? DefaultTtl
                    : TenantOverrideTtl;
                await cache.SetAsync(cacheKey, hit.Body, ttl, ct);
                logger.LogDebug(
                    "Resolved Cosmos prompt {PromptKey}:{TenantId} v{Version}",
                    promptKey, hit.TenantId, hit.Version);
                return hit.Body;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Cosmos prompt lookup failed for {PromptKey}:{TenantId}; falling back to inner registry",
                promptKey, tenantId);
        }

        return await inner.GetPromptAsync(promptKey, tenantId, hardcodedDefault, ct);
    }

    public async Task UpsertPromptAsync(
        string promptKey,
        string tenantId,
        int version,
        string body,
        string? environment = null,
        CancellationToken ct = default)
    {
        var doc = new PromptDocument(
            id: BuildId(promptKey, tenantId, version),
            promptKey: promptKey,
            tenantId: tenantId,
            version: version,
            body: body,
            environment: environment,
            active: true,
            updatedAt: DateTimeOffset.UtcNow);

        await container.UpsertItemAsync(doc, new PartitionKey(promptKey), cancellationToken: ct);

        // Invalidate cached resolution so the next reader picks up the new version.
        await cache.RemoveAsync($"prompt:{tenantId}:{promptKey}", ct);
        if (!string.Equals(tenantId, "default", StringComparison.Ordinal))
            await cache.RemoveAsync($"prompt:default:{promptKey}", ct);
    }

    private async Task<PromptDocument?> TryLoadAsync(string promptKey, string tenantId, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT TOP 1 * FROM c WHERE c.promptKey = @k AND c.tenantId = @t AND c.active = true ORDER BY c.version DESC")
            .WithParameter("@k", promptKey)
            .WithParameter("@t", tenantId);

        using var iterator = container.GetItemQueryIterator<PromptDocument>(
            query,
            requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(promptKey), MaxItemCount = 1 });

        while (iterator.HasMoreResults)
        {
            FeedResponse<PromptDocument> page;
            try
            {
                page = await iterator.ReadNextAsync(ct);
            }
            catch (CosmosException cex) when (cex.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
            foreach (var item in page)
                return item;
        }
        return null;
    }

    private static string BuildId(string promptKey, string tenantId, int version) =>
        $"{promptKey}:{tenantId}:{version}";

    /// <summary>Internal Cosmos document shape (camelCase via CosmosClientOptions).</summary>
    public sealed record PromptDocument(
        string id,
        string promptKey,
        string tenantId,
        int version,
        string body,
        string? environment,
        bool active,
        DateTimeOffset updatedAt)
    {
        public string PromptKey => promptKey;
        public string TenantId => tenantId;
        public int Version => version;
        public string Body => body;
    }
}

/// <summary>
/// Admin surface for the prompt registry. Implemented by the Cosmos-backed registry
/// when persistence is configured; the App-Config registry is read-only.
/// </summary>
public interface IPromptRegistryAdmin
{
    Task UpsertPromptAsync(
        string promptKey,
        string tenantId,
        int version,
        string body,
        string? environment = null,
        CancellationToken ct = default);
}
