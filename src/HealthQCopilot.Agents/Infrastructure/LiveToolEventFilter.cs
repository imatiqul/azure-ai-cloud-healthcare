using System.Diagnostics;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Infrastructure;

/// <summary>
/// W5.2 — Semantic Kernel function-invocation filter that publishes
/// <c>ToolInvoked</c> / <c>ToolCompleted</c> events to the session's
/// Web PubSub group so the Agent Trace UI can render live tool activity.
///
/// Sessionid is taken from <c>kernel.Data["sessionId"]</c>; if absent the
/// filter is a no-op (e.g. background ingestion jobs).
/// Gated by the <c>HealthQ:AgentHandoff</c> feature flag.
/// </summary>
public sealed class LiveToolEventFilter : IFunctionInvocationFilter
{
    private readonly IWebPubSubService _pubSub;
    private readonly IFeatureManager _features;
    private readonly ILogger<LiveToolEventFilter> _logger;

    public LiveToolEventFilter(
        IWebPubSubService pubSub,
        IFeatureManager features,
        ILogger<LiveToolEventFilter> logger)
    {
        _pubSub = pubSub;
        _features = features;
        _logger = logger;
    }

    public async Task OnFunctionInvocationAsync(
        FunctionInvocationContext context,
        Func<FunctionInvocationContext, Task> next)
    {
        var sessionId = context.Kernel.Data.TryGetValue("sessionId", out var s) ? s as string : null;
        var agentName = context.Kernel.Data.TryGetValue("agentName", out var a) ? a as string ?? "agent" : "agent";

        if (string.IsNullOrWhiteSpace(sessionId)
            || !await _features.IsEnabledAsync(HealthQFeatures.AgentHandoff))
        {
            await next(context);
            return;
        }

        var pluginName = context.Function.PluginName ?? string.Empty;
        var functionName = context.Function.Name;

        try { await _pubSub.SendToolInvokedAsync(sessionId, agentName, pluginName, functionName); }
        catch (Exception ex) { _logger.LogDebug(ex, "LiveToolEventFilter: invoked-publish failed"); }

        var sw = Stopwatch.StartNew();
        var success = false;
        try
        {
            await next(context);
            success = true;
        }
        finally
        {
            sw.Stop();
            try { await _pubSub.SendToolCompletedAsync(sessionId, pluginName, functionName, sw.Elapsed.TotalMilliseconds, success); }
            catch (Exception ex) { _logger.LogDebug(ex, "LiveToolEventFilter: completed-publish failed"); }
        }
    }
}
