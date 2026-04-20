using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Consumer;
using System.Text;
using System.Text.Json;

namespace HealthQCopilot.Agents.BackgroundServices;

/// <summary>
/// Consumes wearable/IoT vital readings from Azure Event Hubs and evaluates each
/// reading against clinical alert thresholds in real time.
///
/// Each event is expected to be a JSON payload conforming to <see cref="WearableReading"/>.
/// When a threshold is breached, the agent:
///   1. Creates a FHIR R4 Observation via the FHIR microservice
///   2. Publishes an escalation event to the Dapr pub/sub bus
///   3. Logs the alert to the structured telemetry pipeline
///
/// The consumer uses the default consumer group and checkpoints in memory only
/// (no Azure Blob checkpointing in dev — extend for production resilience).
/// </summary>
public sealed class WearableStreamingAgent : BackgroundService
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<WearableStreamingAgent> _logger;

    // Alert thresholds — move to Azure App Config for tenant-specific overrides
    private static readonly Dictionary<string, (double Low, double High)> Thresholds = new()
    {
        ["heart_rate"]     = (40, 130),
        ["spo2"]           = (90, 101),
        ["systolic_bp"]    = (80, 180),
        ["diastolic_bp"]   = (50, 110),
        ["temperature"]    = (35.0, 38.5),
        ["respiratory"]    = (8, 30),
        ["glucose"]        = (3.5, 13.9),   // mmol/L
    };

    private static readonly Dictionary<string, string> LoincCodes = new()
    {
        ["heart_rate"]  = "8867-4",
        ["spo2"]        = "2708-6",
        ["systolic_bp"] = "8480-6",
        ["diastolic_bp"]= "8462-4",
        ["temperature"] = "8310-5",
        ["respiratory"] = "9279-1",
        ["glucose"]     = "15074-8",
    };

    public WearableStreamingAgent(
        IConfiguration config,
        IHttpClientFactory httpFactory,
        ILogger<WearableStreamingAgent> logger)
    {
        _config = config;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var connectionString = _config["EventHubs:ConnectionString"];
        var eventHubName     = _config.GetValue("EventHubs:WearableHub", "clinical-events");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _logger.LogWarning(
                "WearableStreamingAgent: EventHubs:ConnectionString not configured — agent is inactive. " +
                "Set the connection string in Key Vault / app settings to enable IoT streaming.");
            return;
        }

        await using var consumer = new EventHubConsumerClient(
            EventHubConsumerClient.DefaultConsumerGroupName,
            connectionString,
            eventHubName);

        _logger.LogInformation(
            "WearableStreamingAgent: connected to Event Hub '{Hub}' — listening for vital readings",
            eventHubName);

        await foreach (var partitionEvent in consumer.ReadEventsAsync(stoppingToken))
        {
            if (stoppingToken.IsCancellationRequested) break;

            try
            {
                await ProcessReadingAsync(partitionEvent.Data, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "WearableStreamingAgent: failed to process reading; continuing");
            }
        }
    }

    // ── Processing ─────────────────────────────────────────────────────────────

    private async Task ProcessReadingAsync(EventData eventData, CancellationToken ct)
    {
        var json = Encoding.UTF8.GetString(eventData.Body.ToArray());
        var reading = JsonSerializer.Deserialize<WearableReading>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (reading is null || string.IsNullOrWhiteSpace(reading.VitalType)) return;

        _logger.LogDebug(
            "WearableStreamingAgent: received {Type}={Value} for patient {PatientId}",
            reading.VitalType, reading.Value, reading.PatientId);

        // Always write a FHIR Observation for the reading
        await WriteFhirObservationAsync(reading, ct);

        // Evaluate threshold — if breached, publish escalation event
        if (Thresholds.TryGetValue(reading.VitalType, out var threshold))
        {
            var (low, high) = threshold;
            if (reading.Value < low || reading.Value > high)
            {
                await PublishAlertAsync(reading, low, high, ct);
            }
        }
    }

    // ── FHIR Observation write ─────────────────────────────────────────────────

    private async Task WriteFhirObservationAsync(WearableReading reading, CancellationToken ct)
    {
        var fhirBase = _config.GetValue("Services:FhirBase", "http://localhost:5204");
        var client = _httpFactory.CreateClient("fhir");
        client.BaseAddress = new Uri(fhirBase);

        _ = LoincCodes.TryGetValue(reading.VitalType, out var loincCode);
        loincCode ??= "unknown";

        var observation = new
        {
            resourceType = "Observation",
            status       = "final",
            category     = new[] { new { coding = new[] { new { system = "http://terminology.hl7.org/CodeSystem/observation-category", code = "vital-signs" } } } },
            code         = new { coding = new[] { new { system = "http://loinc.org", code = loincCode, display = reading.VitalType } } },
            subject      = new { reference = $"Patient/{reading.PatientId}" },
            effectiveDateTime = reading.Timestamp.ToString("O"),
            valueQuantity = new { value = reading.Value, unit = reading.Unit ?? "unit", system = "http://unitsofmeasure.org" },
            device       = string.IsNullOrWhiteSpace(reading.DeviceId) ? null : new { reference = $"Device/{reading.DeviceId}" },
        };

        try
        {
            var response = await client.PostAsJsonAsync("/api/v1/fhir/observations", observation, ct);
            if (!response.IsSuccessStatusCode)
                _logger.LogWarning(
                    "WearableStreamingAgent: FHIR Observation write returned {Status} for {Type}/{Patient}",
                    (int)response.StatusCode, reading.VitalType, reading.PatientId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WearableStreamingAgent: FHIR Observation write failed — reading not persisted");
        }
    }

    // ── Alert publication via Dapr ─────────────────────────────────────────────

    private async Task PublishAlertAsync(WearableReading reading, double low, double high, CancellationToken ct)
    {
        var daprBase = _config.GetValue("Dapr:HttpEndpoint", "http://localhost:3500");
        var client   = _httpFactory.CreateClient("dapr");
        client.BaseAddress = new Uri(daprBase);

        var direction = reading.Value < low ? "below" : "above";
        var threshold = reading.Value < low ? low : high;

        var alert = new
        {
            PatientId   = reading.PatientId,
            DeviceId    = reading.DeviceId,
            VitalType   = reading.VitalType,
            Value       = reading.Value,
            Unit        = reading.Unit,
            Direction   = direction,
            Threshold   = threshold,
            Timestamp   = reading.Timestamp,
            Severity    = ComputeSeverity(reading.VitalType, reading.Value, low, high),
        };

        _logger.LogWarning(
            "WearableStreamingAgent: ALERT — {Type}={Value} {Direction} threshold {Threshold} for patient {PatientId} (severity={Severity})",
            reading.VitalType, reading.Value, direction, threshold, reading.PatientId, alert.Severity);

        try
        {
            await client.PostAsJsonAsync(
                "/v1.0/publish/pubsub/wearable.vital.alert", alert, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WearableStreamingAgent: failed to publish vital alert to Dapr pub/sub");
        }
    }

    private static string ComputeSeverity(string vitalType, double value, double low, double high)
    {
        // Critical if more than 20% outside normal range
        var range = high - low;
        if (range <= 0) return "warning";
        var deviation = value < low
            ? (low - value) / range
            : (value - high) / range;
        return deviation > 0.20 ? "critical" : "warning";
    }
}

/// <summary>Event payload from an IoT wearable device published to Azure Event Hubs.</summary>
public sealed record WearableReading(
    string PatientId,
    string VitalType,
    double Value,
    string? Unit,
    string? DeviceId,
    DateTime Timestamp);
