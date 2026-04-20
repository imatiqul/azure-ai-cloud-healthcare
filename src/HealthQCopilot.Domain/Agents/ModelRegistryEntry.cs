using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Agents;

/// <summary>
/// Tracks deployed AI model versions, prompt versions, and evaluation metrics
/// to support FDA 21 CFR Part 11 / ONC HTI-1 AI model governance requirements.
///
/// Each deployment of a new model version, prompt set, or plugin update
/// is registered here, creating an immutable audit trail of what AI was
/// running at any point in time.
/// </summary>
public sealed class ModelRegistryEntry : AggregateRoot<Guid>
{
    public string ModelName { get; private set; } = string.Empty;
    public string ModelVersion { get; private set; } = string.Empty;
    public string DeploymentName { get; private set; } = string.Empty;  // Azure OpenAI deployment
    public string SkVersion { get; private set; } = string.Empty;       // Semantic Kernel NuGet version
    public string PromptHash { get; private set; } = string.Empty;      // SHA-256 of system prompt
    public string PluginManifest { get; private set; } = string.Empty;  // JSON array of plugin names+versions
    public double? LastEvalScore { get; private set; }                  // Golden-set regression score (0.0–1.0)
    public string? EvalNotes { get; private set; }
    public DateTime DeployedAt { get; private set; }
    public string DeployedByUserId { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }

    private ModelRegistryEntry() { }

    public static ModelRegistryEntry Register(
        string modelName,
        string modelVersion,
        string deploymentName,
        string skVersion,
        string promptHash,
        string pluginManifest,
        string deployedByUserId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(modelName);
        ArgumentException.ThrowIfNullOrWhiteSpace(modelVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(deploymentName);

        return new ModelRegistryEntry
        {
            Id               = Guid.NewGuid(),
            ModelName        = modelName,
            ModelVersion     = modelVersion,
            DeploymentName   = deploymentName,
            SkVersion        = skVersion,
            PromptHash       = promptHash,
            PluginManifest   = pluginManifest,
            DeployedByUserId = deployedByUserId,
            DeployedAt       = DateTime.UtcNow,
            IsActive         = true,
        };
    }

    public void RecordEvaluation(double score, string? notes = null)
    {
        LastEvalScore = Math.Clamp(score, 0.0, 1.0);
        EvalNotes     = notes;
    }

    public void Deactivate() => IsActive = false;
}
