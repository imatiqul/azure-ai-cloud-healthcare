namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Configuration for the Cosmos DB-backed <see cref="ITokenLedger"/> and
/// <see cref="IPromptRegistry"/> implementations. Persistence is opt-in via the
/// <see cref="Endpoint"/> setting — when blank the in-memory implementations
/// remain in use, which is the default in dev/test.
/// </summary>
public sealed class CosmosOptions
{
    public const string SectionName = "Cosmos";

    /// <summary>Cosmos DB account endpoint (e.g., https://acct.documents.azure.com:443/).</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Account key. When blank, DefaultAzureCredential is used (preferred for prod).</summary>
    public string? AccountKey { get; set; }

    /// <summary>Database name (created if missing on first call).</summary>
    public string Database { get; set; } = "healthq";

    /// <summary>Container for token usage records (partitioned by /sessionId).</summary>
    public string TokenLedgerContainer { get; set; } = "token-ledger";

    /// <summary>Container for prompt registry entries (partitioned by /promptId).</summary>
    public string PromptRegistryContainer { get; set; } = "prompts";

    /// <summary>TTL for token usage records, in seconds. Default = 30 days.</summary>
    public int TokenLedgerTtlSeconds { get; set; } = 30 * 24 * 3600;
}
