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

        group.MapPost("/events", (HttpRequest request) =>
        {
            // Event Grid webhook endpoint for FHIR change events
            return Results.Ok(new { status = "received" });
        });

        return app;
    }
}
