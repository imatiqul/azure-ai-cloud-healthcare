using FluentAssertions;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

public class LiveToolEventFilterTests
{
    private readonly IWebPubSubService _pubSub = Substitute.For<IWebPubSubService>();
    private readonly IFeatureManager _features = Substitute.For<IFeatureManager>();

    private Kernel BuildKernel(bool tagSession = true, bool throws = false)
    {
        var services = new ServiceCollection();
        services.AddKernel();
        services.AddSingleton<IFunctionInvocationFilter>(
            new LiveToolEventFilter(_pubSub, _features, NullLogger<LiveToolEventFilter>.Instance));

        var sp = services.BuildServiceProvider();
        var kernel = sp.GetRequiredService<Kernel>();

        var fn = throws
            ? KernelFunctionFactory.CreateFromMethod((Func<string>)(() => throw new InvalidOperationException("boom")), "fn")
            : KernelFunctionFactory.CreateFromMethod(() => "ok", "fn");
        kernel.Plugins.Add(KernelPluginFactory.CreateFromFunctions("Triage", new[] { fn }));

        if (tagSession)
        {
            kernel.Data["sessionId"] = "session-42";
            kernel.Data["agentName"] = "TriageAgent";
        }
        return kernel;
    }

    [Fact]
    public async Task PublishesInvokedAndCompleted_WhenSessionTaggedAndFlagOn()
    {
        _features.IsEnabledAsync(HealthQFeatures.AgentHandoff).Returns(true);
        var kernel = BuildKernel();

        await kernel.InvokeAsync("Triage", "fn");

        await _pubSub.Received(1).SendToolInvokedAsync(
            "session-42", "TriageAgent", "Triage", "fn", Arg.Any<CancellationToken>());
        await _pubSub.Received(1).SendToolCompletedAsync(
            "session-42", "Triage", "fn",
            Arg.Is<double>(d => d >= 0),
            true,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task NoOp_WhenSessionIdMissing()
    {
        _features.IsEnabledAsync(HealthQFeatures.AgentHandoff).Returns(true);
        var kernel = BuildKernel(tagSession: false);

        await kernel.InvokeAsync("Triage", "fn");

        await _pubSub.DidNotReceiveWithAnyArgs().SendToolInvokedAsync(default!, default!, default!, default!);
        await _pubSub.DidNotReceiveWithAnyArgs().SendToolCompletedAsync(default!, default!, default!, default, default);
    }

    [Fact]
    public async Task NoOp_WhenFlagOff()
    {
        _features.IsEnabledAsync(HealthQFeatures.AgentHandoff).Returns(false);
        var kernel = BuildKernel();

        await kernel.InvokeAsync("Triage", "fn");

        await _pubSub.DidNotReceiveWithAnyArgs().SendToolInvokedAsync(default!, default!, default!, default!);
    }

    [Fact]
    public async Task PublishesCompletedWithSuccessFalse_WhenInnerThrows()
    {
        _features.IsEnabledAsync(HealthQFeatures.AgentHandoff).Returns(true);
        var kernel = BuildKernel(throws: true);

        var act = async () => await kernel.InvokeAsync("Triage", "fn");

        await act.Should().ThrowAsync<Exception>();
        await _pubSub.Received(1).SendToolCompletedAsync(
            "session-42", "Triage", "fn", Arg.Any<double>(), false, Arg.Any<CancellationToken>());
    }
}
