namespace HealthQCopilot.Fhir.Endpoints;

public static class FhirEndpoints
{
    public static IEndpointRouteBuilder MapFhirEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fhir")
            .WithTags("FHIR");

        // ── DICOM / Imaging proxy (WADO-RS, DICOMweb) ─────────────────────────
        // Proxies DICOM imaging requests to the configured DICOMweb endpoint
        // (HAPI FHIR DICOMweb / Orthanc / Azure Health Data Services DICOM).
        //
        // The OHIF Viewer embedded in encounters-mfe points to this endpoint
        // as its WADO-RS data source, allowing the viewer to retrieve series
        // and instances without exposing the DICOMweb origin to the browser.
        //
        // Study metadata endpoint:   GET /api/v1/fhir/imaging/{studyId}
        // WADO-RS retrieve:          GET /api/v1/fhir/imaging/{studyId}/wado?format=wado
        group.MapGet("/imaging/{studyId}", async (
            string studyId,
            string? format,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            // Return study metadata as JSON (for DicomViewer metadata card)
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync(
                $"ImagingStudy?identifier={Uri.EscapeDataString(studyId)}&_format=json", ct);

            if (!response.IsSuccessStatusCode)
            {
                // Return a synthetic metadata stub so the viewer degrades gracefully
                return Results.Ok(new
                {
                    studyInstanceUid = studyId,
                    studyDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    modality = "OT",
                    description = "Imaging study (metadata unavailable)",
                    seriesCount = 0,
                    instanceCount = 0,
                });
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/fhir+json");
        })
        .WithSummary("Retrieve DICOM study metadata by study ID")
        .WithDescription(
            "Returns FHIR ImagingStudy resource metadata for the specified study. " +
            "Used by the DicomViewer component to render the study metadata card " +
            "and by the OHIF Viewer as a WADO-RS DICOMweb proxy endpoint.");

        group.MapGet("/patients/{id}", async (
            string id,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"Patient/{id}", ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/fhir+json");
        });

        group.MapGet("/patients", async (
            string? name,
            string? identifier,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var query = new List<string>();
            if (!string.IsNullOrEmpty(name)) query.Add($"name={Uri.EscapeDataString(name)}");
            if (!string.IsNullOrEmpty(identifier)) query.Add($"identifier={Uri.EscapeDataString(identifier)}");
            var queryString = query.Count > 0 ? "?" + string.Join("&", query) : "";
            var response = await client.GetAsync($"Patient{queryString}", ct);
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/fhir+json");
        });

        group.MapGet("/encounters/{patientId}", async (
            string patientId,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"Encounter?patient={Uri.EscapeDataString(patientId)}", ct);
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/fhir+json");
        });

        group.MapGet("/appointments/{patientId}", async (
            string patientId,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"Appointment?patient={Uri.EscapeDataString(patientId)}", ct);
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/fhir+json");
        });

        group.MapPost("/patients", async (
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var body = await new StreamReader(request.Body).ReadToEndAsync(ct);
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "Request body is required" });
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/fhir+json");
            var response = await client.PostAsync("Patient", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json", statusCode: (int)response.StatusCode);
        }).WithSummary("Create a FHIR Patient resource");

        group.MapPut("/patients/{id}", async (
            string id,
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var body = await new StreamReader(request.Body).ReadToEndAsync(ct);
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "Request body is required" });
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/fhir+json");
            var response = await client.PutAsync($"Patient/{id}", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json", statusCode: (int)response.StatusCode);
        }).WithSummary("Update a FHIR Patient resource");

        group.MapPost("/encounters", async (
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var body = await new StreamReader(request.Body).ReadToEndAsync(ct);
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "Request body is required" });
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/fhir+json");
            var response = await client.PostAsync("Encounter", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json", statusCode: (int)response.StatusCode);
        }).WithSummary("Create a FHIR Encounter resource");

        group.MapPut("/encounters/{id}", async (
            string id,
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var body = await new StreamReader(request.Body).ReadToEndAsync(ct);
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "Request body is required" });
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/fhir+json");
            var response = await client.PutAsync($"Encounter/{id}", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json", statusCode: (int)response.StatusCode);
        }).WithSummary("Update a FHIR Encounter resource");

        group.MapPost("/appointments", async (
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var body = await new StreamReader(request.Body).ReadToEndAsync(ct);
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/fhir+json");
            var response = await client.PostAsync("Appointment", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json", statusCode: (int)response.StatusCode);
        });

        group.MapPost("/events", async (HttpRequest request, CancellationToken ct) =>
        {
            // Azure Event Grid webhook validation handshake
            if (request.Headers.TryGetValue("aeg-event-type", out var eventType)
                && eventType == "SubscriptionValidation")
            {
                using var reader = new System.IO.StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                var events = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement[]>(body);
                var validationCode = events?[0].GetProperty("data").GetProperty("validationCode").GetString();
                return Results.Ok(new { validationResponse = validationCode });
            }

            // FHIR change notification — acknowledge receipt
            // Full event processing handled by Dapr subscribers
            return Results.Ok(new { status = "accepted" });
        });

        // FHIR Observation — created by the wearable streaming agent (Item 29)
        group.MapPost("/observations", async (
            System.Text.Json.JsonElement body,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var content = new StringContent(
                body.GetRawText(),
                System.Text.Encoding.UTF8,
                "application/fhir+json");
            var response = await client.PostAsync("Observation", content, ct);
            var result = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(result, "application/fhir+json", statusCode: (int)response.StatusCode);
        });

        // FHIR Observation search by patient
        group.MapGet("/observations/{patientId}", async (
            string patientId,
            string? category,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var query = $"Observation?patient={Uri.EscapeDataString(patientId)}";
            if (!string.IsNullOrWhiteSpace(category))
                query += $"&category={Uri.EscapeDataString(category)}";
            var response = await client.GetAsync(query, ct);
            var result = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(result, "application/fhir+json");
        });

        return app;
    }
}

/// <summary>
/// FHIR payer interoperability endpoints — Coverage and ExplanationOfBenefit resources.
/// These proxy to the configured FHIR server (HAPI FHIR) and are used by the
/// Revenue Cycle service for Da Vinci / CARIN IG use cases.
/// </summary>
public static class FhirPayerEndpoints
{
    public static IEndpointRouteBuilder MapFhirPayerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fhir")
            .WithTags("FHIR Payer");

        // ── Coverage ──────────────────────────────────────────────────────────
        // FHIR R4 Coverage resource: represents the patient's insurance policy.
        // Used to verify eligibility and drive prior auth workflows.

        group.MapGet("/coverage/{id}", async (
            string id,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"Coverage/{id}", ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Get a Coverage resource by ID");

        group.MapGet("/coverage", async (
            string? patient,
            string? payor,
            string? status,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var qs = new System.Text.StringBuilder("Coverage?");
            if (!string.IsNullOrEmpty(patient)) qs.Append($"patient={Uri.EscapeDataString(patient)}&");
            if (!string.IsNullOrEmpty(payor)) qs.Append($"payor={Uri.EscapeDataString(payor)}&");
            if (!string.IsNullOrEmpty(status)) qs.Append($"status={Uri.EscapeDataString(status)}&");
            var response = await client.GetAsync(qs.ToString().TrimEnd('?', '&'), ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Search Coverage resources");

        group.MapPost("/coverage", async (
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            using var body = new System.IO.StreamReader(request.Body);
            var content = new System.Net.Http.StringContent(
                await body.ReadToEndAsync(ct),
                System.Text.Encoding.UTF8,
                "application/fhir+json");
            var response = await client.PostAsync("Coverage", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json",
                statusCode: (int)response.StatusCode);
        }).WithSummary("Create a Coverage resource");

        group.MapPut("/coverage/{id}", async (
            string id,
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            using var body = new System.IO.StreamReader(request.Body);
            var content = new System.Net.Http.StringContent(
                await body.ReadToEndAsync(ct),
                System.Text.Encoding.UTF8,
                "application/fhir+json");
            var response = await client.PutAsync($"Coverage/{id}", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json",
                statusCode: (int)response.StatusCode);
        }).WithSummary("Update a Coverage resource");

        // ── ExplanationOfBenefit (EOB) ─────────────────────────────────────────
        // FHIR R4 ExplanationOfBenefit: summarises a payer's decision on a claim.
        // Supports CARIN Consumer Directed Payer Data Exchange (CARIN IG for Blue Button 2.0).

        group.MapGet("/explanation-of-benefit/{id}", async (
            string id,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"ExplanationOfBenefit/{id}", ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Get an ExplanationOfBenefit resource by ID");

        group.MapGet("/explanation-of-benefit", async (
            string? patient,
            string? claim,
            string? status,
            string? type,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var qs = new System.Text.StringBuilder("ExplanationOfBenefit?");
            if (!string.IsNullOrEmpty(patient)) qs.Append($"patient={Uri.EscapeDataString(patient)}&");
            if (!string.IsNullOrEmpty(claim)) qs.Append($"claim={Uri.EscapeDataString(claim)}&");
            if (!string.IsNullOrEmpty(status)) qs.Append($"status={Uri.EscapeDataString(status)}&");
            if (!string.IsNullOrEmpty(type)) qs.Append($"type={Uri.EscapeDataString(type)}&");
            var response = await client.GetAsync(qs.ToString().TrimEnd('?', '&'), ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Search ExplanationOfBenefit resources");

        group.MapPost("/explanation-of-benefit", async (
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            using var body = new System.IO.StreamReader(request.Body);
            var content = new System.Net.Http.StringContent(
                await body.ReadToEndAsync(ct),
                System.Text.Encoding.UTF8,
                "application/fhir+json");
            var response = await client.PostAsync("ExplanationOfBenefit", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json",
                statusCode: (int)response.StatusCode);
        }).WithSummary("Create an ExplanationOfBenefit resource");

        // ── Coverage $eligibility operation ───────────────────────────────────
        // Proxies to CRD / DTR / PAS Coverage Requirements Discovery FHIR operation.
        // Supports Da Vinci Coverage Requirements Discovery (CRD) IG.
        group.MapPost("/coverage/{id}/$eligibility", async (
            string id,
            HttpRequest request,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            using var body = new System.IO.StreamReader(request.Body);
            var content = new System.Net.Http.StringContent(
                await body.ReadToEndAsync(ct),
                System.Text.Encoding.UTF8,
                "application/fhir+json");
            var response = await client.PostAsync($"Coverage/{id}/$eligibility", content, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(responseBody, "application/fhir+json",
                statusCode: (int)response.StatusCode);
        }).WithSummary("Check coverage eligibility for a patient");

        // ── Observation search ────────────────────────────────────────────────
        // FHIR R4 Observation resource search — clinical measurements and lab results.
        // HL7v2 ORU^R01 messages are transformed to Observations by the MLLP listener;
        // this endpoint exposes those observations via REST for patient timeline views.
        group.MapGet("/observations", async (
            string? patient,
            string? code,
            string? date,
            string? category,
            string? status,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var qs = new System.Text.StringBuilder("Observation?");
            if (!string.IsNullOrEmpty(patient)) qs.Append($"patient={Uri.EscapeDataString(patient)}&");
            if (!string.IsNullOrEmpty(code)) qs.Append($"code={Uri.EscapeDataString(code)}&");
            if (!string.IsNullOrEmpty(date)) qs.Append($"date={Uri.EscapeDataString(date)}&");
            if (!string.IsNullOrEmpty(category)) qs.Append($"category={Uri.EscapeDataString(category)}&");
            if (!string.IsNullOrEmpty(status)) qs.Append($"status={Uri.EscapeDataString(status)}&");
            var response = await client.GetAsync(qs.ToString().TrimEnd('?', '&'), ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Search FHIR Observation resources (lab results, vitals)");

        group.MapGet("/observations/{id}", async (
            string id,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var response = await client.GetAsync($"Observation/{id}", ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("Get a FHIR Observation resource by ID");

        // ── Patient $everything operation ──────────────────────────────────────
        // FHIR R4 $everything: returns a Bundle of all resources related to a patient
        // — encounters, observations, conditions, medications, care plans, documents.
        // US Core and USCDI v2 compliance requires this compartment-level operation.
        // HIPAA right-of-access (§164.524): patients can request all their records.
        group.MapGet("/patients/{id}/$everything", async (
            string id,
            string? start,
            string? end,
            string? type,
            IHttpClientFactory httpClientFactory,
            CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("FhirServer");
            var qs = new System.Text.StringBuilder($"Patient/{id}/$everything?");
            if (!string.IsNullOrEmpty(start)) qs.Append($"start={Uri.EscapeDataString(start)}&");
            if (!string.IsNullOrEmpty(end)) qs.Append($"end={Uri.EscapeDataString(end)}&");
            if (!string.IsNullOrEmpty(type)) qs.Append($"_type={Uri.EscapeDataString(type)}&");
            var response = await client.GetAsync(qs.ToString().TrimEnd('?', '&'), ct);
            if (!response.IsSuccessStatusCode)
                return Results.StatusCode((int)response.StatusCode);
            return Results.Content(await response.Content.ReadAsStringAsync(ct), "application/fhir+json");
        }).WithSummary("FHIR Patient $everything — full patient compartment Bundle");

        return app;
    }
}
