using HealthQCopilot.Fhir.Endpoints;
using HealthQCopilot.Fhir.Hl7v2;
using HealthQCopilot.Fhir.Middleware;
using HealthQCopilot.Fhir.Persistence;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;


var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "fhir-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddHealthcareDb<FhirDbContext>(
    builder.Configuration, "FhirDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<FhirDbContext>(builder.Configuration);
builder.Services.AddFhirHttpClient(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<FhirDbContext>("fhir");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "FhirDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();
builder.Services.AddMemoryCache();

// ── MLLP HL7 v2 Inbound Listener ─────────────────────────────────────────────
// Listens on TCP 2575 for ADT/ORU messages from hospital EHR systems.
// Transform to FHIR R4 and write to the external FHIR server.
builder.Services.AddSingleton<IHl7v2MessageHandler, Hl7v2FhirTransformer>();
builder.Services.AddSingleton<HealthQCopilot.Fhir.Services.LabDeltaFlaggingService>();
builder.Services.AddHostedService(sp =>
{
    var port = sp.GetRequiredService<IConfiguration>().GetValue<int>("Hl7v2:MllpPort", 2575);
    return new MllpListenerService(
        sp.GetRequiredService<IHl7v2MessageHandler>(),
        sp.GetRequiredService<ILogger<MllpListenerService>>(),
        port);
});

// HttpClient used by the SMART callback to exchange the authorization code for tokens at B2C
builder.Services.AddHttpClient("SmartTokenExchange", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

// HttpClients used by CDS Hooks to call internal services for clinical decision support
builder.Services.AddHttpClient("RevenueCycleService", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["Services:RevenueCycleBaseUrl"] ?? "http://revenue-service");
    client.Timeout = TimeSpan.FromSeconds(5);
});

builder.Services.AddHttpClient("IdentityService", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["Services:IdentityBaseUrl"] ?? "http://identity-service");
    client.Timeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();

await app.InitializeDatabaseAsync<FhirDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseCloudEvents();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseMiddleware<ConsentEnforcementMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapSubscribeHandler();
app.MapDefaultEndpoints();
app.MapFhirEndpoints();
app.MapFhirPayerEndpoints();
app.MapFhirBulkExportEndpoints();
app.MapSmartEndpoints();
app.MapSmartLaunchEndpoints();
app.MapCdsHooksEndpoints();
app.MapLabDeltaEndpoints();

app.Run();

public partial class Program { }
