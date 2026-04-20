using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Billing;

/// <summary>
/// Tracks and forwards metered usage to Azure Marketplace via the SaaS Metering API.
///
/// Integration flow:
///   1. Microservices call <see cref="TrackAsync"/> after each billable operation.
///   2. Events are queued in-memory and flushed every minute by a background job.
///   3. On flush, events are grouped by (tenantId, dimension, hour) and sent to
///      the Azure Marketplace Metering API (https://marketplaceapi.microsoft.com/api/usageEvent).
///
/// In local / non-production environments (no ResourceId configured), events are
/// logged to the console only — no external HTTP call is made.
/// </summary>
public sealed class UsageMeteringService : IUsageMeteringService
{
    private readonly UsageMeteringOptions _options;
    private readonly ILogger<UsageMeteringService> _logger;
    private readonly List<UsageEvent> _buffer = [];
    private readonly SemaphoreSlim _lock = new(1, 1);

    public UsageMeteringService(
        UsageMeteringOptions options,
        ILogger<UsageMeteringService> logger)
    {
        _options = options;
        _logger = logger;
    }

    /// <summary>Records a metered usage event for the given tenant.</summary>
    public async Task TrackAsync(
        Guid tenantId,
        string dimension,
        double quantity,
        CancellationToken ct = default)
    {
        var evt = new UsageEvent(tenantId, dimension, quantity, DateTimeOffset.UtcNow);

        await _lock.WaitAsync(ct);
        try { _buffer.Add(evt); }
        finally { _lock.Release(); }

        _logger.LogDebug("[Billing] {Dimension} +{Quantity} for tenant {TenantId}", dimension, quantity, tenantId);
    }

    /// <summary>
    /// Flushes buffered events to the Azure Marketplace Metering API.
    /// Called by <see cref="UsageMeteringFlushJob"/>.
    /// </summary>
    public async Task FlushAsync(HttpClient http, CancellationToken ct = default)
    {
        List<UsageEvent> snapshot;

        await _lock.WaitAsync(ct);
        try
        {
            if (_buffer.Count == 0) return;
            snapshot = new List<UsageEvent>(_buffer);
            _buffer.Clear();
        }
        finally { _lock.Release(); }

        // Group by (tenantId, dimension, hour) and sum quantities
        var aggregated = snapshot
            .GroupBy(e => (e.TenantId, e.Dimension, Hour: new DateTimeOffset(
                e.EffectiveTime.Year, e.EffectiveTime.Month, e.EffectiveTime.Day,
                e.EffectiveTime.Hour, 0, 0, e.EffectiveTime.Offset)))
            .Select(g => new
            {
                resourceId = _options.ResourceId,
                quantity = g.Sum(e => e.Quantity),
                dimension = g.Key.Dimension,
                effectiveStartTime = g.Key.Hour.ToString("o"),
                planId = _options.PlanId
            });

        if (string.IsNullOrEmpty(_options.ResourceId))
        {
            foreach (var item in aggregated)
                _logger.LogInformation("[Billing-DryRun] {Dimension} qty={Quantity} tenant={TenantId}",
                    item.dimension, item.quantity, snapshot.First().TenantId);
            return;
        }

        // POST to Azure Marketplace Metering API
        // https://learn.microsoft.com/azure/marketplace/partner-center-portal/marketplace-metering-service-apis
        var batchPayload = new { request = aggregated };
        var response = await http.PostAsJsonAsync(
            "https://marketplaceapi.microsoft.com/api/batchUsageEvent?api-version=2018-08-31",
            batchPayload, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("[Billing] Metering API error {Status}: {Body}", response.StatusCode, body);
        }
        else
        {
            _logger.LogInformation("[Billing] Flushed {Count} usage events to Marketplace API", snapshot.Count);
        }
    }
}
