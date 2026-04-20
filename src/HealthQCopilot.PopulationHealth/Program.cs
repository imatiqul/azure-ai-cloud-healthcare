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
builder.Services.AddSingleton<ReadmissionRiskPredictor>();
builder.Services.AddSingleton<RiskCalculationService>(sp =>
    new RiskCalculationService(
        sp.GetRequiredService<ILogger<RiskCalculationService>>(),
        sp.GetRequiredService<ReadmissionRiskPredictor>()));
builder.Services.AddSingleton<HedisMeasureCalculator>();
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "PopHealthDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();

var app = builder.Build();

await app.InitializeDatabaseAsync<PopHealthDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseCloudEvents();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapSubscribeHandler();
app.MapDefaultEndpoints();
app.MapPopHealthEndpoints();

app.MapPost("/api/v1/population-health/seed", async (PopHealthDbContext db, RiskCalculationService calculator, CareGapNotificationDispatcher notificationDispatcher) =>
{
    if (await db.PatientRisks.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    // Risk scores are now calculated by the deterministic scoring engine rather than hardcoded
    var riskData = new[]
    {
        ("PAT-001", new List<string> { "Diabetes", "Hypertension", "Age>65" }),
        ("PAT-002", new List<string> { "CHF", "COPD" }),
        ("PAT-003", new List<string> { "Chronic Pain", "Opioid Use" }),
        ("PAT-004", new List<string> { "Asthma", "Smoking" }),
        ("PAT-005", new List<string> { "Obesity", "Pre-diabetes" }),
        ("PAT-006", new List<string> { "Seasonal Allergies" }),
        ("PAT-007", new List<string> { "Routine Care" }),
    };
    var risks = riskData.Select(r => calculator.Calculate(r.Item1, r.Item2)).ToArray();
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
