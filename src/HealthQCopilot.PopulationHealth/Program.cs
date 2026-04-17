using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.PopulationHealth.Endpoints;
using HealthQCopilot.PopulationHealth.Infrastructure;
using Microsoft.EntityFrameworkCore;


var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "pophealth-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddDbContext<PopHealthDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("PopHealthDb"))
       .AddInterceptors(new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
                        new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor()));
builder.Services.AddOutboxRelay<PopHealthDbContext>(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<PopHealthDbContext>("pophealth");

var app = builder.Build();

await app.InitializeDatabaseAsync<PopHealthDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapPopHealthEndpoints();

app.MapPost("/api/v1/population-health/seed", async (PopHealthDbContext db) =>
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
    return Results.Ok(new { message = "Seeded", risks = risks.Length, careGaps = gaps.Length });
});

app.Run();

public partial class Program { }
