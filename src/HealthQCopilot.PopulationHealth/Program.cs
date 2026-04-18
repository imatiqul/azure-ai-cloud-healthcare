using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.PopulationHealth.Endpoints;
using HealthQCopilot.PopulationHealth.Infrastructure;
using HealthQCopilot.PopulationHealth.Services;
using Microsoft.EntityFrameworkCore;


var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "pophealth-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddHealthcareDb<PopHealthDbContext>(
    builder.Configuration, "PopHealthDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<PopHealthDbContext>(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<PopHealthDbContext>("pophealth");

// CareGapNotificationDispatcher: fire-and-forget HTTP calls to Notification service via APIM
var apiBase = builder.Configuration["Services:ApiBase"] ?? "https://healthq-copilot-apim.azure-api.net";
builder.Services.AddHttpClient<CareGapNotificationDispatcher>(client =>
{
    client.BaseAddress = new Uri(apiBase);
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<CareGapNotificationDispatcher>();
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "PopHealthDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();

var app = builder.Build();

await app.InitializeDatabaseAsync<PopHealthDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapPopHealthEndpoints();

app.MapPost("/api/v1/population-health/seed", async (PopHealthDbContext db, CareGapNotificationDispatcher notificationDispatcher) =>
{
    if (await db.PatientRisks.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    var risks = new[]
    {
        PatientRisk.Create("PAT-001", RiskLevel.Critical, 0.92, "v2.1", ["Diabetes", "Hypertension", "Age>65"]),
        PatientRisk.Create("PAT-002", RiskLevel.High, 0.78, "v2.1", ["CHF", "COPD"]),
        PatientRisk.Create("PAT-003", RiskLevel.High, 0.71, "v2.1", ["Chronic Pain", "Opioid Use"]),
        PatientRisk.Create("PAT-004", RiskLevel.Moderate, 0.55, "v2.1", ["Asthma", "Smoking"]),
        PatientRisk.Create("PAT-005", RiskLevel.Moderate, 0.48, "v2.1", ["Obesity", "Pre-diabetes"]),
        PatientRisk.Create("PAT-006", RiskLevel.Low, 0.22, "v2.1", ["Seasonal Allergies"]),
        PatientRisk.Create("PAT-007", RiskLevel.Low, 0.15, "v2.1", ["Routine Care"]),
    };
    db.PatientRisks.AddRange(risks);

    var gaps = new[]
    {
        CareGap.Create("PAT-001", "HBA1C", "HbA1c screening overdue (>6 months)"),
        CareGap.Create("PAT-001", "EYE-EXAM", "Diabetic eye exam not completed this year"),
        CareGap.Create("PAT-002", "BNP", "BNP monitoring overdue for CHF patient"),
        CareGap.Create("PAT-003", "PAIN-MGMT", "Pain management follow-up needed"),
        CareGap.Create("PAT-004", "SPIROMETRY", "Annual spirometry not completed"),
        CareGap.Create("PAT-005", "BMI-COUNSEL", "BMI counseling not documented"),
    };
    db.CareGaps.AddRange(gaps);
    await db.SaveChangesAsync();
    // Fire-and-forget: bulk notification campaigns for all open care gaps
    _ = Task.Run(() => notificationDispatcher.DispatchOpenCareGapCampaignsAsync(gaps, CancellationToken.None));
    return Results.Ok(new { message = "Seeded", risks = risks.Length, careGaps = gaps.Length });
});

app.Run();

public partial class Program { }
