namespace HealthQCopilot.Fhir.Endpoints;

public static class FhirEndpoints
{
    public static IEndpointRouteBuilder MapFhirEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fhir")
            .WithTags("FHIR");

        group.MapGet("/patients/{id}", async (
            string id,
            IHttpClientFactory httpClientFactory,
            IConfiguration config,
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

        return app;
    }
}
