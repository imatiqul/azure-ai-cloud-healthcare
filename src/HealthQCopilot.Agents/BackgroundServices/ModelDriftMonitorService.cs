using Dapr.Client;
using HealthQCopilot.Agents.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.BackgroundServices;

/// <summary>
/// Monitors rolling average of AI triage confidence scores and publishes
/// a Dapr alert if the average drops below a configured drift threshold.
///
/// Drift detection algorithm: computes a 24-hour rolling average of
/// AgentDecision latency as a proxy for model confidence degradation.
/// In production, replace with actual probability scores stored per decision.
///
/// Alert event: published to Dapr topic "model.drift.detected" on "pubsub".
/// Subscribers (Notification service) will send alerts to on-call clinical ops.
/// </summary>
public sealed class ModelDriftMonitorService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly DaprClient _dapr;
    private readonly ILogger<ModelDriftMonitorService> _logger;
    private readonly TimeSpan _checkInterval;
    private readonly double _latencyDriftThresholdMs;

    public ModelDriftMonitorService(
        IServiceScopeFactory scopeFactory,
        DaprClient dapr,
        ILogger<ModelDriftMonitorService> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _dapr = dapr;
        _logger = logger;
        _checkInterval = TimeSpan.FromMinutes(
            configuration.GetValue("ModelGovernance:DriftCheckIntervalMinutes", 60));
        _latencyDriftThresholdMs = configuration.GetValue("ModelGovernance:LatencyDriftThresholdMs", 3000.0);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial delay to allow the application to fully start
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckForDriftAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ModelDriftMonitorService: drift check failed");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }
    }

    private async Task CheckForDriftAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AgentDbContext>();

        var cutoff = DateTime.UtcNow.AddHours(-24);

        var recentDecisions = await db.AgentDecisions
            .Where(d => d.CreatedAt >= cutoff)
            .Select(d => new { d.Latency, d.IsGuardApproved })
            .ToListAsync(ct);

        if (recentDecisions.Count < 10)
        {
            _logger.LogDebug("ModelDriftMonitorService: insufficient decisions ({Count}) in last 24h — skipping drift check",
                recentDecisions.Count);
            return;
        }

        var avgLatency = recentDecisions.Average(d => d.Latency.TotalMilliseconds);
        var guardRejectionRate = recentDecisions.Count(d => !d.IsGuardApproved) / (double)recentDecisions.Count;

        _logger.LogInformation(
            "ModelDriftMonitorService: 24h stats — avg latency {Latency:F0}ms, guard rejection rate {Rate:P1}, decisions: {Count}",
            avgLatency, guardRejectionRate, recentDecisions.Count);

        // ── Drift signals ──────────────────────────────────────────────────────
        var driftSignals = new List<string>();

        if (avgLatency > _latencyDriftThresholdMs)
            driftSignals.Add($"Average latency {avgLatency:F0}ms exceeds threshold {_latencyDriftThresholdMs}ms");

        if (guardRejectionRate > 0.20)
            driftSignals.Add($"Hallucination guard rejection rate {guardRejectionRate:P1} exceeds 20% threshold");

        if (driftSignals.Count > 0)
        {
            _logger.LogWarning(
                "ModelDriftMonitorService: DRIFT DETECTED — {Signals}",
                string.Join("; ", driftSignals));

            try
            {
                await _dapr.PublishEventAsync("pubsub", "model.drift.detected", new
                {
                    DetectedAt = DateTime.UtcNow,
                    AvgLatencyMs = avgLatency,
                    GuardRejectionRate = guardRejectionRate,
                    DecisionCount = recentDecisions.Count,
                    DriftSignals = driftSignals,
                    Severity = guardRejectionRate > 0.30 ? "Critical" : "Warning",
                }, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ModelDriftMonitorService: failed to publish drift alert to Dapr");
            }
        }
    }
}
