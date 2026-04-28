using Microsoft.Extensions.Options;

namespace HealthQCopilot.Infrastructure.AI;

public sealed class PricingOptions
{
    public const string SectionName = "Pricing";

    public Dictionary<string, ModelRate> Models { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public decimal DefaultInputPer1K { get; set; } = 0.0m;
    public decimal DefaultOutputPer1K { get; set; } = 0.0m;

    public sealed class ModelRate
    {
        public decimal InputPer1K { get; set; }
        public decimal OutputPer1K { get; set; }
    }
}

/// <summary>
/// Configuration-driven <see cref="IModelPricing"/>. Falls back to defaults when
/// <paramref name="modelId"/> is not in the rate table; never throws.
/// </summary>
public sealed class ConfiguredModelPricing(IOptionsMonitor<PricingOptions> options) : IModelPricing
{
    public decimal Estimate(string modelId, int promptTokens, int completionTokens)
    {
        if (promptTokens <= 0 && completionTokens <= 0) return 0m;
        var opts = options.CurrentValue;
        decimal input, output;
        if (!string.IsNullOrEmpty(modelId) && opts.Models.TryGetValue(modelId, out var rate))
        {
            input = rate.InputPer1K;
            output = rate.OutputPer1K;
        }
        else
        {
            input = opts.DefaultInputPer1K;
            output = opts.DefaultOutputPer1K;
        }
        return (promptTokens / 1000m) * input + (completionTokens / 1000m) * output;
    }
}
