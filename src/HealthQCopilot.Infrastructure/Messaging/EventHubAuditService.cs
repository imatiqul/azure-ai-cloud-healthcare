using System.Text;
using System.Text.Json;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Messaging;

/// <summary>
/// Azure Event Hubs implementation of <see cref="IEventHubAuditService"/>.
/// Publishes PHI audit events as JSON to the configured Event Hub for HIPAA-compliant
/// immutable audit trail. Falls back to structured logging when Event Hubs is not configured.
/// </summary>
public sealed class EventHubAuditService : IEventHubAuditService, IAsyncDisposable
{
    private readonly EventHubProducerClient? _producer;
    private readonly ILogger<EventHubAuditService> _logger;

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    public EventHubAuditService(IConfiguration config, ILogger<EventHubAuditService> logger)
    {
        _logger = logger;

        var connectionString = config["EventHubs:AuditConnectionString"];
        var hubName = config["EventHubs:AuditHubName"] ?? "phi-audit-events";

        if (!string.IsNullOrEmpty(connectionString))
        {
            _producer = new EventHubProducerClient(connectionString, hubName);
            _logger.LogInformation("Azure Event Hubs audit enabled → hub: {HubName}", hubName);
        }
        else
        {
            _logger.LogWarning(
                "EventHubs:AuditConnectionString not configured — audit events will be logged only.");
        }
    }

    public async Task PublishAsync(AuditEvent evt, CancellationToken ct = default)
    {
        try
        {
            if (_producer is null)
            {
                // Fallback: structured log entry when Event Hubs is not configured
                _logger.LogInformation(
                    "[AUDIT] {EventType} | {Resource} | {Action} | session={SessionId} | user={UserId} | status={StatusCode} | {Timestamp}",
                    evt.EventType, evt.Resource, evt.Action,
                    evt.SessionId ?? "-", evt.UserId ?? "anon",
                    evt.HttpStatusCode, evt.Timestamp);
                return;
            }

            var json = JsonSerializer.Serialize(evt, SerializerOptions);
            var data = new EventData(Encoding.UTF8.GetBytes(json));
            data.Properties["eventType"] = evt.EventType;
            data.Properties["sessionId"] = evt.SessionId ?? string.Empty;

            using var batch = await _producer.CreateBatchAsync(ct);
            if (!batch.TryAdd(data))
            {
                _logger.LogWarning("Audit event too large for single Event Hubs batch; dropping.");
                return;
            }

            await _producer.SendAsync(batch, ct);
        }
        catch (Exception ex)
        {
            // Audit publishing must never crash the request pipeline
            _logger.LogError(ex, "Failed to publish audit event {EventType} to Event Hubs", evt.EventType);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_producer is not null)
            await _producer.DisposeAsync();
    }
}
