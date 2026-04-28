using FluentAssertions;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Metrics;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W2.4 — verifies the SK function-invocation filter chain hard-stops a
/// disallowed plugin when ToolRbac is enabled, while staying transparent in
/// the open-policy default. The SK seam is the only point where every plugin
/// call funnels through, so this gate is the single source of truth for
/// per-agent capability scoping.
/// </summary>
public sealed class ToolPolicyFilterTests
{
    private static Kernel BuildKernel(
        bool rbacOn,
        Dictionary<string, string[]> policy,
        string agentName = "TestAgent")
    {
        var features = Substitute.For<IFeatureManager>();
        features.IsEnabledAsync(HealthQFeatures.ToolRbac).Returns(rbacOn);

        var policyOpts = new AgentToolPolicyOptions();
        foreach (var kv in policy) policyOpts[kv.Key] = kv.Value;
        var enforcer = new ToolPolicyEnforcer(
            Options.Create(policyOpts),
            features,
            NullLogger<ToolPolicyEnforcer>.Instance);

        var sp = new ServiceCollection().AddMetrics().BuildServiceProvider();
        var metrics = new BusinessMetrics(sp.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());

        var filter = new ToolPolicyFilter(enforcer, metrics, NullLogger<ToolPolicyFilter>.Instance);

        var kb = Kernel.CreateBuilder();
        kb.Services.AddSingleton<IFunctionInvocationFilter>(filter);
        var kernel = kb.Build();
        kernel.Data["agentName"] = agentName;
        return kernel;
    }

    [Fact]
    public async Task When_rbac_off_function_executes_unimpeded()
    {
        var kernel = BuildKernel(rbacOn: false, policy: new());
        var fn = KernelFunctionFactory.CreateFromMethod(() => "ok", "Run");
        var plugin = KernelPluginFactory.CreateFromFunctions("RestrictedPlugin", [fn]);
        kernel.Plugins.Add(plugin);

        var result = await kernel.InvokeAsync(plugin["Run"]);

        result.GetValue<string>().Should().Be("ok");
    }

    [Fact]
    public async Task When_rbac_on_and_plugin_allowed_function_executes()
    {
        var kernel = BuildKernel(
            rbacOn: true,
            policy: new() { ["TestAgent"] = new[] { "AllowedPlugin" } });
        var fn = KernelFunctionFactory.CreateFromMethod(() => "ok", "Run");
        var plugin = KernelPluginFactory.CreateFromFunctions("AllowedPlugin", [fn]);
        kernel.Plugins.Add(plugin);

        var result = await kernel.InvokeAsync(plugin["Run"]);

        result.GetValue<string>().Should().Be("ok");
    }

    [Fact]
    public async Task When_rbac_on_and_plugin_not_allowed_invocation_is_denied()
    {
        var kernel = BuildKernel(
            rbacOn: true,
            policy: new() { ["TestAgent"] = new[] { "OnlyThisOne" } });
        var fn = KernelFunctionFactory.CreateFromMethod(() => "ok", "Run");
        var plugin = KernelPluginFactory.CreateFromFunctions("RestrictedPlugin", [fn]);
        kernel.Plugins.Add(plugin);

        // SK may wrap filter exceptions, so accept either direct or inner.
        Func<Task> act = () => kernel.InvokeAsync(plugin["Run"]);

        var ex = await act.Should().ThrowAsync<Exception>();
        ex.Which.Should().Match<Exception>(e =>
            e is UnauthorizedAccessException || e.InnerException is UnauthorizedAccessException);
    }

    [Fact]
    public async Task When_agent_has_no_policy_entry_invocation_is_denied()
    {
        // Default-deny under flag-on with empty policy entry for this agent.
        var kernel = BuildKernel(
            rbacOn: true,
            policy: new() { ["OtherAgent"] = new[] { "AnyPlugin" } });
        var fn = KernelFunctionFactory.CreateFromMethod(() => "ok", "Run");
        var plugin = KernelPluginFactory.CreateFromFunctions("AnyPlugin", [fn]);
        kernel.Plugins.Add(plugin);

        Func<Task> act = () => kernel.InvokeAsync(plugin["Run"]);
        var ex = await act.Should().ThrowAsync<Exception>();
        ex.Which.Should().Match<Exception>(e =>
            e is UnauthorizedAccessException || e.InnerException is UnauthorizedAccessException);
    }
}

