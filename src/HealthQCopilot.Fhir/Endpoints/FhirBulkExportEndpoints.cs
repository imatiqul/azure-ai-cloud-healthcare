using System.Runtime.CompilerServices;
using System.Text.Json;

namespace HealthQCopilot.Fhir.Endpoints;

/// <summary>
/// FHIR R4 Bulk Data Access ($export) endpoints per
/// https://hl7.org/fhir/uv/bulkdata/export.html
///
/// Implemented as synchronous streaming (inline NDJSON) rather than async polling,
/// since the FHIR server is HAPI which supports direct $export queries.
/// The Content-Type for NDJSON bulk responses is "application/ndjson".
///
/// Supported operations:
///   GET /api/v1/fhir/Patient/$export               — all patients
///   GET /api/v1/fhir/Patient/{id}/$export           — single patient (patient-level)
///   GET /api/v1/fhir/Group/{id}/$export             — group/cohort export
///   GET /api/v1/fhir/$export                        — system-level export
/// </summary>
public static class FhirBulkExportEndpoints
{
    public static IEndpointRouteBuilder MapFhirBulkExportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fhir").WithTags("FHIR Bulk Export");

        // ── System-level $export ──────────────────────────────────────────────
        // Exports all resources of specified types across the system.
        group.MapGet("/$export", async (
            string? _type,
            string? _since,
            HttpResponse httpResponse,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            await StreamBulkExportAsync(
                fhirPath: BuildExportQuery("", _type, _since),
                resourceTypes: ParseTypes(_type, DefaultSystemTypes),
                httpResponse, httpClientFactory, ct);
        }).WithSummary("FHIR system-level bulk export ($export)")
          .Produces(200, contentType: "application/ndjson");

        // ── Patient-level $export (all patients) ─────────────────────────────
        group.MapGet("/Patient/$export", async (
            string? _type,
            string? _since,
            HttpResponse httpResponse,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            await StreamBulkExportAsync(
                fhirPath: BuildExportQuery("Patient", _type, _since),
                resourceTypes: ParseTypes(_type, DefaultPatientTypes),
                httpResponse, httpClientFactory, ct);
        }).WithSummary("FHIR patient-level bulk export ($export)")
          .Produces(200, contentType: "application/ndjson");

        // ── Patient/{id}/$export — single patient ─────────────────────────────
        group.MapGet("/Patient/{id}/$export", async (
            string id,
            string? _type,
            string? _since,
            HttpResponse httpResponse,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var resourceTypes = ParseTypes(_type, DefaultPatientTypes);
            httpResponse.ContentType = "application/ndjson";
            httpResponse.Headers.Append("X-Content-Type-Options", "nosniff");

            var client = httpClientFactory.CreateClient("FhirServer");

            await foreach (var line in FetchPatientResourcesAsync(client, id, resourceTypes, _since, ct))
            {
                await httpResponse.WriteAsync(line + "\n", ct);
                await httpResponse.Body.FlushAsync(ct);
            }
        }).WithSummary("FHIR single-patient bulk export")
          .Produces(200, contentType: "application/ndjson");

        // ── Group/{id}/$export — population/cohort export ─────────────────────
        group.MapGet("/Group/{id}/$export", async (
            string id,
            string? _type,
            string? _since,
            HttpResponse httpResponse,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            // Resolve Group members, then stream each patient's resources
            var client = httpClientFactory.CreateClient("FhirServer");
            var groupResp = await client.GetAsync($"Group/{id}", ct);
            if (!groupResp.IsSuccessStatusCode)
            {
                httpResponse.StatusCode = (int)groupResp.StatusCode;
                return;
            }

            var resourceTypes = ParseTypes(_type, DefaultPatientTypes);
            httpResponse.ContentType = "application/ndjson";
            httpResponse.Headers.Append("X-Content-Type-Options", "nosniff");

            var groupJson = await groupResp.Content.ReadAsStringAsync(ct);
            using var groupDoc = JsonDocument.Parse(groupJson);

            var memberIds = new List<string>();
            if (groupDoc.RootElement.TryGetProperty("member", out var members))
            {
                foreach (var member in members.EnumerateArray())
                {
                    if (member.TryGetProperty("entity", out var entity)
                        && entity.TryGetProperty("reference", out var refProp))
                    {
                        var reference = refProp.GetString() ?? "";
                        // Reference format: "Patient/{id}"
                        var patId = reference.StartsWith("Patient/")
                            ? reference["Patient/".Length..]
                            : reference;
                        memberIds.Add(patId);
                    }
                }
            }

            foreach (var patId in memberIds)
            {
                await foreach (var line in FetchPatientResourcesAsync(client, patId, resourceTypes, _since, ct))
                {
                    await httpResponse.WriteAsync(line + "\n", ct);
                    await httpResponse.Body.FlushAsync(ct);
                }
            }
        }).WithSummary("FHIR group/cohort bulk export ($export)")
          .Produces(200, contentType: "application/ndjson");

        return app;
    }

    // ── Streaming helpers ─────────────────────────────────────────────────────

    private static async Task StreamBulkExportAsync(
        string fhirPath,
        IReadOnlyList<string> resourceTypes,
        HttpResponse httpResponse,
        IHttpClientFactory httpClientFactory,
        CancellationToken ct)
    {
        httpResponse.ContentType = "application/ndjson";
        httpResponse.Headers.Append("X-Content-Type-Options", "nosniff");

        var client = httpClientFactory.CreateClient("FhirServer");

        foreach (var resourceType in resourceTypes)
        {
            await foreach (var line in SearchAllPagesAsync(client, $"{resourceType}?_count=1000", ct))
            {
                await httpResponse.WriteAsync(line + "\n", ct);
                await httpResponse.Body.FlushAsync(ct);
            }
        }
    }

    /// <summary>Pages through a FHIR search bundle, yielding one NDJSON line per resource.</summary>
    private static async IAsyncEnumerable<string> SearchAllPagesAsync(
        HttpClient client,
        string searchUrl,
        [EnumeratorCancellation] CancellationToken ct)
    {
        string? nextUrl = searchUrl;
        while (nextUrl is not null && !ct.IsCancellationRequested)
        {
            var resp = await client.GetAsync(nextUrl, ct);
            if (!resp.IsSuccessStatusCode) yield break;

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("entry", out var entries))
            {
                foreach (var entry in entries.EnumerateArray())
                {
                    if (entry.TryGetProperty("resource", out var resource))
                        yield return resource.GetRawText();
                }
            }

            // Follow the "next" link for pagination
            nextUrl = null;
            if (doc.RootElement.TryGetProperty("link", out var links))
            {
                foreach (var link in links.EnumerateArray())
                {
                    if (link.TryGetProperty("relation", out var rel) && rel.GetString() == "next"
                        && link.TryGetProperty("url", out var url))
                    {
                        nextUrl = url.GetString();
                        break;
                    }
                }
            }
        }
    }

    /// <summary>
    /// Fetches clinical data for a single patient across multiple resource types.
    /// </summary>
    private static async IAsyncEnumerable<string> FetchPatientResourcesAsync(
        HttpClient client,
        string patientId,
        IReadOnlyList<string> resourceTypes,
        string? since,
        [EnumeratorCancellation] CancellationToken ct)
    {
        // Always include the Patient resource itself
        var patResp = await client.GetAsync($"Patient/{patientId}", ct);
        if (patResp.IsSuccessStatusCode)
        {
            var patJson = await patResp.Content.ReadAsStringAsync(ct);
            yield return patJson;
        }

        var sinceFilter = string.IsNullOrEmpty(since) ? "" : $"&_lastUpdated=ge{Uri.EscapeDataString(since)}";

        foreach (var resourceType in resourceTypes.Where(t => t != "Patient"))
        {
            var url = $"{resourceType}?patient={Uri.EscapeDataString(patientId)}&_count=1000{sinceFilter}";
            await foreach (var line in SearchAllPagesAsync(client, url, ct))
                yield return line;
        }
    }

    // ── Configuration helpers ─────────────────────────────────────────────────

    private static string BuildExportQuery(string prefix, string? typeFilter, string? since)
    {
        var qs = new System.Text.StringBuilder();
        if (!string.IsNullOrEmpty(typeFilter)) qs.Append($"_type={Uri.EscapeDataString(typeFilter)}&");
        if (!string.IsNullOrEmpty(since)) qs.Append($"_since={Uri.EscapeDataString(since)}&");
        var q = qs.ToString().TrimEnd('&');
        return string.IsNullOrEmpty(prefix) ? q : prefix;
    }

    private static IReadOnlyList<string> ParseTypes(string? typeParam, IReadOnlyList<string> defaults)
    {
        if (string.IsNullOrEmpty(typeParam)) return defaults;
        return typeParam.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static readonly IReadOnlyList<string> DefaultPatientTypes =
    [
        "Patient", "Condition", "Encounter", "Observation", "MedicationRequest",
        "AllergyIntolerance", "Procedure", "DiagnosticReport", "Coverage",
        "ExplanationOfBenefit", "CarePlan", "Immunization", "DocumentReference"
    ];

    private static readonly IReadOnlyList<string> DefaultSystemTypes =
    [
        "Patient", "Practitioner", "Organization", "Location",
        "Condition", "Encounter", "Observation", "MedicationRequest",
        "AllergyIntolerance", "Procedure", "DiagnosticReport",
        "Coverage", "ExplanationOfBenefit"
    ];
}
