using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>W4.2 — verifies USD cost estimation against the configured rate table.</summary>
public sealed class ConfiguredModelPricingTests
{
    [Fact]
    public void Estimate_uses_model_specific_rate()
    {
        var opts = new PricingOptions
        {
            Models = new(StringComparer.OrdinalIgnoreCase)
            {
                ["gpt-4o"] = new() { InputPer1K = 0.005m, OutputPer1K = 0.015m },
            },
            DefaultInputPer1K = 0.001m,
            DefaultOutputPer1K = 0.002m,
        };
        var sut = CreateSut(opts);

        // 1000 prompt + 500 completion → 1.000*0.005 + 0.500*0.015 = 0.0125
        sut.Estimate("gpt-4o", 1000, 500).Should().Be(0.0125m);
    }

    [Fact]
    public void Estimate_falls_back_to_default_for_unknown_model()
    {
        var opts = new PricingOptions { DefaultInputPer1K = 0.001m, DefaultOutputPer1K = 0.002m };
        var sut = CreateSut(opts);

        sut.Estimate("unknown-model", 2000, 1000).Should().Be(0.001m * 2 + 0.002m * 1);
    }

    [Fact]
    public void Estimate_returns_zero_for_zero_tokens()
    {
        var sut = CreateSut(new PricingOptions
        {
            Models = new() { ["x"] = new() { InputPer1K = 1m, OutputPer1K = 1m } },
        });

        sut.Estimate("x", 0, 0).Should().Be(0m);
    }

    private static ConfiguredModelPricing CreateSut(PricingOptions opts)
    {
        var monitor = Substitute.For<IOptionsMonitor<PricingOptions>>();
        monitor.CurrentValue.Returns(opts);
        return new ConfiguredModelPricing(monitor);
    }
}
