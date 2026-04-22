using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Resilience;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
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
}).AddServiceResilienceHandler();
builder.Services.AddScoped<CareGapNotificationDispatcher>();
builder.Services.AddSingleton<ReadmissionRiskPredictor>();
builder.Services.AddSingleton<RiskCalculationService>(sp =>
    new RiskCalculationService(
        sp.GetRequiredService<ILogger<RiskCalculationService>>(),
        sp.GetRequiredService<ReadmissionRiskPredictor>()));
builder.Services.AddSingleton<HedisMeasureCalculator>();
builder.Services.AddScoped<SdohScoringService>();
builder.Services.AddScoped<CostPredictionService>();
builder.Services.AddSingleton<DrugInteractionService>();
builder.Services.AddScoped<RiskTrajectoryService>();
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "PopHealthDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();
builder.Services.AddOutputCache(opts =>
{
    opts.AddPolicy("short", b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("riskLevel", "status", "top", "skip"));
    opts.AddPolicy("medium", b => b.Expire(TimeSpan.FromMinutes(5)).SetVaryByQuery("*"));
});
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<PopHealthDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseCloudEvents();
app.UseMiddleware<TenantContextMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapSubscribeHandler();
app.MapDefaultEndpoints();
app.MapPopHealthEndpoints();

app.MapPost("/api/v1/population-health/seed", async (PopHealthDbContext db, CareGapNotificationDispatcher notificationDispatcher) =>
{
    if (await db.PatientRisks.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    // ── Patient risk records — 8 diverse patients with explicit risk scores ────
    // Using PatientRisk.Create() directly so scores are deterministic in demo.
    var risks = new[]
    {
        PatientRisk.Create("PAT-001", RiskLevel.Critical, 0.94, "risk-v3", ["Heart Failure", "CKD Stage 3", "Age>65", "Multiple ED Visits"]),
        PatientRisk.Create("PAT-002", RiskLevel.Critical, 0.91, "risk-v3", ["COPD", "Type 2 Diabetes", "BMI>35", "Non-adherent"]),
        PatientRisk.Create("PAT-003", RiskLevel.High,     0.82, "risk-v3", ["CAD", "Hypertension", "Dyslipidemia", "Smoker"]),
        PatientRisk.Create("PAT-004", RiskLevel.High,     0.79, "risk-v3", ["Type 2 Diabetes", "Obesity", "Peripheral Neuropathy"]),
        PatientRisk.Create("PAT-005", RiskLevel.High,     0.76, "risk-v3", ["Hypertension", "Dyslipidemia", "Pre-diabetes"]),
        PatientRisk.Create("PAT-006", RiskLevel.Moderate, 0.58, "risk-v3", ["Asthma", "Allergic Rhinitis"]),
        PatientRisk.Create("PAT-007", RiskLevel.Moderate, 0.54, "risk-v3", ["Hypertension"]),
        PatientRisk.Create("PAT-008", RiskLevel.Low,      0.32, "risk-v3", ["Hyperthyroidism"]),
    };
    db.PatientRisks.AddRange(risks);

    // ── Care gaps — open for high-risk patients ───────────────────────────────
    var gaps = new[]
    {
        CareGap.Create("PAT-001", "HBA1C",         "HbA1c screening overdue (>6 months) — diabetes management"),
        CareGap.Create("PAT-001", "EYE-EXAM",      "Diabetic eye exam not completed this year"),
        CareGap.Create("PAT-002", "BNP",           "BNP monitoring overdue for CHF patient"),
        CareGap.Create("PAT-002", "BCS",           "Breast cancer screening (mammogram) — 2+ years overdue"),
        CareGap.Create("PAT-003", "COL",           "Colorectal cancer screening — colonoscopy not on record"),
        CareGap.Create("PAT-003", "CBP",           "Blood pressure control — BP 148/94 at last visit"),
        CareGap.Create("PAT-004", "SPIROMETRY",    "Annual spirometry not completed for COPD risk patient"),
        CareGap.Create("PAT-005", "STATIN",        "Statin therapy not initiated despite ASCVD risk score >12%"),
        CareGap.Create("PAT-005", "WELLNESS",      "Annual wellness visit not completed this year"),
        CareGap.Create("PAT-006", "BMI-COUNSEL",   "BMI counseling not documented for obese patient"),
        CareGap.Create("PAT-007", "PAIN-MGMT",     "Pain management follow-up overdue"),
        CareGap.Create("PAT-008", "PNEUMO-VAX",    "Pneumococcal vaccination (PPSV23) — age 65+ due"),
    };
    db.CareGaps.AddRange(gaps);

    // ── Risk history for PAT-001 — enables trajectory chart ──────────────────
    // Six snapshots over 60 days showing a worsening trend.
    (int daysAgo, RiskLevel level, double score, double? delta, string[] factors)[] historyData =
    [
        (60, RiskLevel.High,     0.71, null, ["Heart Failure", "CKD Stage 3"]),
        (45, RiskLevel.High,     0.76, 0.05, ["Heart Failure", "CKD Stage 3", "ED Visit"]),
        (30, RiskLevel.High,     0.82, 0.06, ["Heart Failure", "CKD Stage 3", "Multiple ED Visits"]),
        (15, RiskLevel.Critical, 0.88, 0.06, ["Heart Failure", "CKD Stage 3", "Multiple ED Visits", "Age>65"]),
        (7,  RiskLevel.Critical, 0.91, 0.03, ["Heart Failure", "CKD Stage 3", "Multiple ED Visits", "Age>65"]),
        (2,  RiskLevel.Critical, 0.94, 0.03, ["Heart Failure", "CKD Stage 3", "Multiple ED Visits", "Age>65"]),
    ];

    foreach (var (daysAgo, level, score, delta, factors) in historyData)
    {
        var h = PatientRiskHistory.Create("PAT-001", level, score, "risk-v3", factors, delta);
        db.PatientRiskHistories.Add(h);
        // Override AssessedAt to simulate historical timestamps (private setter, set via EF tracker)
        db.Entry(h).Property("AssessedAt").CurrentValue = DateTime.UtcNow.AddDays(-daysAgo);
    }

    await db.SaveChangesAsync();
    _ = Task.Run(() => notificationDispatcher.DispatchOpenCareGapCampaignsAsync(gaps, CancellationToken.None));
    return Results.Ok(new { message = "Seeded", risks = risks.Length, careGaps = gaps.Length, historySnapshots = historyData.Length });
});

app.Run();

public partial class Program { }
