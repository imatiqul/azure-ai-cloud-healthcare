using System.Text.Json;

namespace HealthQCopilot.Fhir.Endpoints;

/// <summary>
/// HL7 CDS Hooks 2.0 endpoints — published as a "CDS Service" conforming to
/// https://cds-hooks.hl7.org/2.0/
///
/// Discovery: GET  /cds-services
/// Services:
///   POST /cds-services/healthq-patient-risk      (patient-view hook)
///   POST /cds-services/healthq-order-check       (order-sign hook)
///   POST /cds-services/healthq-appointment-risk  (appointment-book hook)
/// </summary>
public static class CdsHooksEndpoints
{
    private static readonly JsonSerializerOptions CamelCase =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static IEndpointRouteBuilder MapCdsHooksEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/cds-services").WithTags("CDS Hooks");

        // ── Discovery ─────────────────────────────────────────────────────────
        // Returns the list of CDS services available in this server.
        // Clients (EHRs) call this endpoint to learn what hooks are supported.
        group.MapGet("/", () =>
        {
            return Results.Ok(new
            {
                services = new[]
                {
                    new
                    {
                        hook = "patient-view",
                        id = "healthq-patient-risk",
                        title = "HealthQ Patient Risk Score",
                        description = "Presents a patient risk stratification card when a clinician opens a patient chart. Combines chronic condition history, care-gap status, and recent triage events.",
                        prefetch = new Dictionary<string, string>
                        {
                            ["patient"] = "Patient/{{context.patientId}}",
                            ["conditions"] = "Condition?patient={{context.patientId}}&clinical-status=active",
                        }
                    },
                    new
                    {
                        hook = "order-sign",
                        id = "healthq-order-check",
                        title = "HealthQ Prior Authorization Checker",
                        description = "Flags procedures and medications in a draft order set that require prior authorization. Queries the HealthQ Revenue Cycle service in real-time.",
                        prefetch = new Dictionary<string, string>
                        {
                            ["patient"] = "Patient/{{context.patientId}}",
                            ["draftOrders"] = "{{context.draftOrders}}",
                        }
                    },
                    new
                    {
                        hook = "appointment-book",
                        id = "healthq-appointment-risk",
                        title = "HealthQ Appointment Risk & Care Gaps",
                        description = "Surfaces outstanding care gaps and a population health risk score when a patient appointment is being booked.",
                        prefetch = new Dictionary<string, string>
                        {
                            ["patient"] = "Patient/{{context.patientId}}",
                        }
                    },
                }
            });
        }).WithSummary("CDS Hooks service discovery document");

        // ── patient-view: Patient Risk Score ──────────────────────────────────
        // Called by the EHR when a clinician opens a patient chart.
        // Returns a risk score info card derived from the Population Health service.
        group.MapPost("/healthq-patient-risk", async (
            CdsHookRequest request,
            IHttpClientFactory httpClientFactory,
            ILogger<CdsHooksLog> logger,
            CancellationToken ct) =>
        {
            var patientId = request.Context.TryGetValue("patientId", out var pid)
                ? pid?.ToString() : null;

            // Default card — risk assessment unavailable
            var cards = new List<CdsCard>
            {
                new(
                    Summary: "HealthQ Risk Assessment",
                    Indicator: "info",
                    Detail: string.IsNullOrEmpty(patientId)
                        ? "Patient ID not provided in hook context."
                        : $"Risk stratification for patient {patientId}: pending population health analysis.",
                    Source: new CdsSource("HealthQ Copilot", "https://healthqcopilot.io"))
            };

            // Optionally enrich from population health endpoint
            try
            {
                var client = httpClientFactory.CreateClient("IdentityService");
                var riskResponse = await client.GetAsync($"api/v1/patients/{patientId}/risk-summary", ct);
                if (riskResponse.IsSuccessStatusCode)
                {
                    var json = await riskResponse.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(json);
                    var riskLevel = doc.RootElement.TryGetProperty("riskLevel", out var rl) ? rl.GetString() : null;
                    var score = doc.RootElement.TryGetProperty("score", out var sc) ? sc.GetDouble() : (double?)null;

                    var indicator = riskLevel?.ToLowerInvariant() switch
                    {
                        "high" => "critical",
                        "medium" => "warning",
                        _ => "info"
                    };

                    cards[0] = new CdsCard(
                        Summary: $"Patient Risk: {riskLevel ?? "Unknown"}" + (score.HasValue ? $" ({score:F1}/100)" : ""),
                        Indicator: indicator,
                        Detail: $"HealthQ population health risk stratification for patient {patientId}. Review care gaps and chronic condition alerts.",
                        Source: new CdsSource("HealthQ Copilot", "https://healthqcopilot.io"));
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Could not fetch risk summary for patient {PatientId}", patientId);
            }

            return Results.Ok(new CdsResponse(cards));
        }).WithSummary("CDS patient-view hook — returns patient risk score card");

        // ── order-sign: Prior Authorization Check ────────────────────────────
        // Called by the EHR when a clinician signs an order set.
        // Queries the Revenue Cycle service for prior-auth requirements.
        group.MapPost("/healthq-order-check", async (
            CdsHookRequest request,
            IHttpClientFactory httpClientFactory,
            ILogger<CdsHooksLog> logger,
            CancellationToken ct) =>
        {
            var cards = new List<CdsCard>();

            // Extract draft orders from the FHIR Bundle in context
            if (!request.Context.TryGetValue("draftOrders", out var draftOrdersRaw))
            {
                cards.Add(new CdsCard(
                    Summary: "Prior Auth Check",
                    Indicator: "info",
                    Detail: "No draft orders found in hook context.",
                    Source: new CdsSource("HealthQ Revenue Cycle", "https://healthqcopilot.io")));
                return Results.Ok(new CdsResponse(cards));
            }

            // Collect procedure codes from the bundle
            var procedureCodes = new List<string>();
            try
            {
                var draftOrdersJson = JsonSerializer.Serialize(draftOrdersRaw);
                using var bundle = JsonDocument.Parse(draftOrdersJson);
                if (bundle.RootElement.TryGetProperty("entry", out var entries))
                {
                    foreach (var entry in entries.EnumerateArray())
                    {
                        if (!entry.TryGetProperty("resource", out var res)) continue;
                        // Extract code from ServiceRequest or MedicationRequest
                        if (res.TryGetProperty("code", out var codeElem)
                            && codeElem.TryGetProperty("coding", out var codings))
                        {
                            foreach (var coding in codings.EnumerateArray())
                            {
                                if (coding.TryGetProperty("code", out var c))
                                    procedureCodes.Add(c.GetString()!);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse draftOrders bundle");
            }

            if (procedureCodes.Count == 0)
            {
                cards.Add(new CdsCard(
                    Summary: "No Procedure Codes",
                    Indicator: "info",
                    Detail: "Could not extract procedure codes from draft orders.",
                    Source: new CdsSource("HealthQ Revenue Cycle", "https://healthqcopilot.io")));
                return Results.Ok(new CdsResponse(cards));
            }

            // Query Revenue Cycle service for pending prior-auth requirements
            try
            {
                var patientId = request.Context.TryGetValue("patientId", out var p) ? p?.ToString() : null;
                var revClient = httpClientFactory.CreateClient("RevenueCycleService");
                var priorAuthResponse = await revClient.GetAsync(
                    $"api/v1/revenue/prior-auths?patientId={Uri.EscapeDataString(patientId ?? "")}",
                    ct);

                if (priorAuthResponse.IsSuccessStatusCode)
                {
                    var json = await priorAuthResponse.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(json);
                    var submittedAuths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    foreach (var auth in doc.RootElement.EnumerateArray())
                    {
                        if (auth.TryGetProperty("procedureCode", out var pc) && pc.GetString() is { } code)
                            submittedAuths.Add(code);
                    }

                    foreach (var code in procedureCodes)
                    {
                        if (!submittedAuths.Contains(code))
                        {
                            cards.Add(new CdsCard(
                                Summary: $"Prior Auth Required: {code}",
                                Indicator: "warning",
                                Detail: $"Procedure {code} may require prior authorization from the patient's insurer. Submit a prior auth request via the HealthQ Revenue Cycle module before ordering.",
                                Source: new CdsSource("HealthQ Revenue Cycle", "https://healthqcopilot.io")));
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Could not reach Revenue Cycle service for prior-auth check");
            }

            if (cards.Count == 0)
            {
                cards.Add(new CdsCard(
                    Summary: "Prior Authorization Check Complete",
                    Indicator: "info",
                    Detail: "All ordered procedures appear to have prior authorization on file.",
                    Source: new CdsSource("HealthQ Revenue Cycle", "https://healthqcopilot.io")));
            }

            return Results.Ok(new CdsResponse(cards));
        }).WithSummary("CDS order-sign hook — checks prior authorization requirements for draft orders");

        // ── appointment-book: Risk & Care Gaps ──────────────────────────────
        // Called by the EHR when scheduling a patient appointment.
        // Returns care gap summary and risk level to guide appointment type.
        group.MapPost("/healthq-appointment-risk", async (
            CdsHookRequest request,
            IHttpClientFactory httpClientFactory,
            ILogger<CdsHooksLog> logger,
            CancellationToken ct) =>
        {
            var patientId = request.Context.TryGetValue("patientId", out var pid)
                ? pid?.ToString() : null;

            var cards = new List<CdsCard>();

            // Attempt to fetch care gap summary
            try
            {
                var client = httpClientFactory.CreateClient("IdentityService");
                var response = await client.GetAsync($"api/v1/patients/{patientId}/care-gaps", ct);

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(json);

                    var openGaps = new List<string>();
                    if (doc.RootElement.TryGetProperty("gaps", out var gapsElem))
                    {
                        foreach (var gap in gapsElem.EnumerateArray())
                        {
                            if (gap.TryGetProperty("description", out var d))
                                openGaps.Add(d.GetString() ?? "Unknown gap");
                        }
                    }

                    if (openGaps.Count > 0)
                    {
                        cards.Add(new CdsCard(
                            Summary: $"{openGaps.Count} Open Care Gap(s)",
                            Indicator: "warning",
                            Detail: $"Patient has {openGaps.Count} unresolved care gaps: {string.Join("; ", openGaps.Take(3))}. Consider scheduling a care gap closure visit.",
                            Source: new CdsSource("HealthQ Population Health", "https://healthqcopilot.io")));
                    }
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Could not fetch care gaps for patient {PatientId}", patientId);
            }

            // Default info card if no specific alerts raised
            if (cards.Count == 0)
            {
                cards.Add(new CdsCard(
                    Summary: "HealthQ Appointment Check",
                    Indicator: "info",
                    Detail: $"No outstanding care gaps or high-risk alerts for patient {patientId ?? "(unknown)"}.",
                    Source: new CdsSource("HealthQ Copilot", "https://healthqcopilot.io")));
            }

            return Results.Ok(new CdsResponse(cards));
        }).WithSummary("CDS appointment-book hook — surfaces care gaps and risk score at scheduling");

        return app;
    }
}

// ── CDS Hooks data model ──────────────────────────────────────────────────────

/// <summary>
/// Incoming CDS hook request. The <see cref="Context"/> dictionary contains hook-specific
/// fields (e.g. patientId, draftOrders) as defined in the HL7 CDS Hooks specification.
/// </summary>
public sealed class CdsHookRequest
{
    public required string Hook { get; init; }
    public string? HookInstance { get; init; }
    public string? FhirServer { get; init; }
    public Dictionary<string, object?> Context { get; init; } = [];
    public Dictionary<string, object?>? Prefetch { get; init; }
}

/// <summary>CDS Hooks response envelope containing zero or more cards.</summary>
public sealed record CdsResponse(IReadOnlyList<CdsCard> Cards);

/// <summary>
/// A CDS Hooks card. Indicator must be one of: info, warning, critical.
/// </summary>
public sealed record CdsCard(
    string Summary,
    string Indicator,
    string? Detail,
    CdsSource Source,
    IReadOnlyList<CdsSuggestion>? Suggestions = null,
    string? SelectionBehavior = null);

/// <summary>Source attribution for a CDS card.</summary>
public sealed record CdsSource(string Label, string? Url = null, string? Icon = null);

/// <summary>An optional suggested action within a CDS card.</summary>
public sealed record CdsSuggestion(string Label, IReadOnlyList<CdsAction>? Actions = null);

/// <summary>A FHIR action associated with a CDS suggestion.</summary>
public sealed record CdsAction(
    string Type,
    string Description,
    object? Resource = null);

// Marker type for ILogger<> in static endpoint class
internal sealed class CdsHooksLog { }
