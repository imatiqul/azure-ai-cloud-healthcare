using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using HealthQCopilot.ServiceDefaults.Features;

namespace HealthQCopilot.Agents.Services.Orchestration;

/// <summary>
/// W2.4 — tool RBAC. Given an agent role, returns the allow-listed plugin set
/// from <see cref="AgentToolPolicyOptions"/>. When <c>HealthQ:ToolRbac</c> is
/// disabled the check returns true (open policy). Used by orchestrators before
/// invoking a kernel function.
/// </summary>
public interface IToolPolicyEnforcer
{
    Task<bool> IsAllowedAsync(string agentName, string pluginName, CancellationToken ct = default);
}

public sealed class ToolPolicyEnforcer(
    IOptions<AgentToolPolicyOptions> options,
    IFeatureManager features,
    ILogger<ToolPolicyEnforcer> logger) : IToolPolicyEnforcer
{
    public async Task<bool> IsAllowedAsync(string agentName, string pluginName, CancellationToken ct = default)
    {
        if (!await features.IsEnabledAsync(HealthQFeatures.ToolRbac))
        {
            return true; // open policy when flag off
        }

        var policy = options.Value;
        if (policy is null || policy.Count == 0)
        {
            logger.LogWarning("AgentToolPolicy not configured; defaulting to deny under ToolRbac flag.");
            return false;
        }

        if (!policy.TryGetValue(agentName, out var allowed) || allowed is null)
        {
            logger.LogWarning("Agent {Agent} has no AgentToolPolicy entry; denying {Plugin}.", agentName, pluginName);
            return false;
        }

        var ok = allowed.Any(p => string.Equals(p, pluginName, StringComparison.OrdinalIgnoreCase));
        if (!ok)
        {
            logger.LogWarning("Tool RBAC denied: agent={Agent} plugin={Plugin}", agentName, pluginName);
        }
        return ok;
    }
}
