using HealthQCopilot.Fhir.Services;
using System.Text.Json;

namespace HealthQCopilot.Fhir.Endpoints;

/// <summary>
/// Lab Delta Flagging endpoints.
///
/// POST /api/v1/fhir/observations/delta-check
///   Accepts a batch of new lab observations + prior values for the same patient/analyte,
///   returns any observations that exceed AACC/CLIA delta thresholds or are outside
///   critical ranges.
///
/// GET /api/v1/fhir/observations/{patientId}/delta-flags
///   Simulated convenience endpoint: generates a reference batch of observations for
///   the given patient and runs the delta check against synthetic prior values.
///   In production, prior values would be queried from the FHIR Observation store.
/// </summary>
public static class LabDeltaEndpoints
{
    private static readonly JsonSerializerOptions Camel =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = false };

    public static IEndpointRouteBuilder MapLabDeltaEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fhir/observations").WithTags("Lab Delta Flags");

        // ── Batch delta check ────────────────────────────────────────────────
        group.MapPost("/delta-check", (
            LabDeltaCheckRequest request,
            LabDeltaFlaggingService svc) =>
        {
            var priorLookup = (request.PriorObservations ?? [])
                .ToDictionary(o => $"{o.PatientId}:{o.LoincCode}", o => o);

            var result = svc.Check(request.NewObservations, priorLookup);
            return Results.Ok(result);
        })
        .WithSummary("Batch lab delta check — flags clinically significant value changes")
        .WithDescription(
            "Compares each new observation against the most recent prior value for the same " +
            "patient + LOINC code. Returns flags when absolute/relative delta thresholds " +
            "(AACC/CLIA/RCP guidelines) or critical-range limits are exceeded. " +
            "Supports 16 analytes: glucose, creatinine, sodium, potassium, hemoglobin, WBC, " +
            "platelets, ALT, AST, ALP, CK, bicarbonate, chloride, HbA1c, cholesterol, HDL.");

        // ── Per-patient convenience endpoint ─────────────────────────────────
        // In production, prior observations are fetched from the FHIR Observation store.
        // Here we demonstrate the delta-check pattern with inline synthetic data.
        group.MapGet("/{patientId}/delta-flags", (
            string patientId,
            LabDeltaFlaggingService svc) =>
        {
            // Synthetic "current" observations — replace with FHIR query in production
            var current = new List<LabObservationDto>
            {
                new(patientId, "2160-0", 8.5,  "mg/dL",  DateTime.UtcNow),   // Creatinine — high delta
                new(patientId, "2823-3", 2.2,  "mEq/L",  DateTime.UtcNow),   // Potassium  — critical low
                new(patientId, "2345-7", 95,   "mg/dL",  DateTime.UtcNow),   // Glucose    — normal
                new(patientId, "718-7",  6.8,  "g/dL",   DateTime.UtcNow),   // Hemoglobin — critical low
            };

            var prior = new Dictionary<string, LabObservationDto>
            {
                [$"{patientId}:2160-0"] = new(patientId, "2160-0", 1.1, "mg/dL", DateTime.UtcNow.AddDays(-7)),
                [$"{patientId}:2823-3"] = new(patientId, "2823-3", 4.0, "mEq/L", DateTime.UtcNow.AddDays(-7)),
                [$"{patientId}:2345-7"] = new(patientId, "2345-7", 90,  "mg/dL", DateTime.UtcNow.AddDays(-7)),
                [$"{patientId}:718-7"]  = new(patientId, "718-7",  12.0,"g/dL",  DateTime.UtcNow.AddDays(-7)),
            };

            var result = svc.Check(current, prior);
            return Results.Ok(result);
        })
        .WithSummary("Get lab delta flags for a patient")
        .WithDescription("Returns clinically significant lab delta flags for the specified patient. " +
            "Queries current and prior FHIR Observations and applies AACC delta-check thresholds.");

        return app;
    }
}

public sealed record LabDeltaCheckRequest(
    IReadOnlyList<LabObservationDto> NewObservations,
    IReadOnlyList<LabObservationDto>? PriorObservations);
