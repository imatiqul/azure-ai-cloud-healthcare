namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// Configuration for agent planning loop budget enforcement (W2.6).
/// Bound from <c>AgentBudget</c> section.
/// </summary>
public sealed class AgentBudgetOptions
{
    public const string SectionName = "AgentBudget";

    public int MaxIterations { get; set; } = 8;
    public long MaxTotalTokens { get; set; } = 16_000;
    public double MaxWallClockSeconds { get; set; } = 30;
}

/// <summary>
/// Configuration for tool RBAC (W2.4). Maps an agent name to the list of plugin
/// names it may invoke. Bound from <c>AgentToolPolicy</c>.
/// </summary>
public sealed class AgentToolPolicyOptions : Dictionary<string, string[]>
{
    public const string SectionName = "AgentToolPolicy";
}

/// <summary>
/// Data-residency allow-list (W1.3). Validates that the configured Azure OpenAI
/// endpoint resides in an approved region. Bound from <c>AzureOpenAI:AllowedRegions</c>.
/// </summary>
public sealed class AzureOpenAIRegionOptions
{
    public const string SectionName = "AzureOpenAI:AllowedRegions";
    public string[] AllowedRegions { get; set; } = Array.Empty<string>();
}
