using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Infrastructure.Metrics;
using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Infrastructure;

/// <summary>
/// W2.4 — Semantic Kernel function-invocation filter that enforces tool RBAC
/// before any plugin function executes. Resolves the calling agent from
/// <c>kernel.Data["agentName"]</c> (set by orchestrators / planning loop) and
/// delegates the allow-listed-plugin lookup to <see cref="IToolPolicyEnforcer"/>.
///
/// On deny: throws <see cref="UnauthorizedAccessException"/> so SK aborts the
/// auto-function-call chain and the planning loop captures it as an iteration
/// error. Records a counter (<c>agent_tool_rbac_denied_total</c>) tagged with
/// agent + plugin so the W3.6 dashboard surfaces RBAC violations.
///
/// Open by default — when <c>HealthQ:ToolRbac</c> is off the enforcer returns
/// true (see <see cref="ToolPolicyEnforcer"/>) and this filter is a transparent
/// pass-through.
/// </summary>
public sealed class ToolPolicyFilter : IFunctionInvocationFilter
{
    private readonly IToolPolicyEnforcer _enforcer;
    private readonly BusinessMetrics _metrics;
    private readonly ILogger<ToolPolicyFilter> _logger;

    public ToolPolicyFilter(
        IToolPolicyEnforcer enforcer,
        BusinessMetrics metrics,
        ILogger<ToolPolicyFilter> logger)
    {
        _enforcer = enforcer;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task OnFunctionInvocationAsync(
        FunctionInvocationContext context,
        Func<FunctionInvocationContext, Task> next)
    {
        var agentName = context.Kernel.Data.TryGetValue("agentName", out var a)
            ? a as string ?? "unknown"
            : "unknown";
        var pluginName = context.Function.PluginName ?? string.Empty;

        // Functions invoked outside a plugin (raw prompts) bypass RBAC — there
        // is no tool surface to gate.
        if (string.IsNullOrEmpty(pluginName))
        {
            await next(context);
            return;
        }

        var allowed = await _enforcer.IsAllowedAsync(agentName, pluginName);
        if (!allowed)
        {
            _metrics.AgentToolRbacDeniedTotal.Add(
                1,
                new KeyValuePair<string, object?>("agent", agentName),
                new KeyValuePair<string, object?>("plugin", pluginName));
            _logger.LogWarning(
                "Tool RBAC denied for agent={Agent} plugin={Plugin} function={Function}",
                agentName, pluginName, context.Function.Name);
            throw new UnauthorizedAccessException(
                $"Agent '{agentName}' is not authorized to invoke plugin '{pluginName}'.");
        }

        await next(context);
    }
}
