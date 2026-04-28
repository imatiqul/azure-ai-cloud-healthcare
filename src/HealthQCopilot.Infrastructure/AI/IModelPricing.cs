namespace HealthQCopilot.Infrastructure.AI;

/// <summary>
/// W4.2 — resolves USD cost for a model usage event from configured per-model rates.
///
/// Pricing is sourced from the <c>Pricing</c> configuration section, e.g.:
/// <code>
/// "Pricing": {
///   "Models": {
///     "gpt-4o":      { "InputPer1K": 0.005,  "OutputPer1K": 0.015 },
///     "gpt-4o-mini": { "InputPer1K": 0.00015,"OutputPer1K": 0.0006 }
///   },
///   "DefaultInputPer1K":  0.001,
///   "DefaultOutputPer1K": 0.002
/// }
/// </code>
/// </summary>
public interface IModelPricing
{
    /// <summary>Returns the estimated USD cost for the given prompt/completion token counts on <paramref name="modelId"/>.</summary>
    decimal Estimate(string modelId, int promptTokens, int completionTokens);
}
