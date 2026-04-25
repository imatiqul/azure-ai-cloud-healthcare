using FluentValidation;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Resilience;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
using HealthQCopilot.RevenueCycle.Endpoints;
using HealthQCopilot.RevenueCycle.Infrastructure;
using HealthQCopilot.RevenueCycle.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "revenue-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<RevenueDbContext>(
    builder.Configuration, "RevenueDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<RevenueDbContext>(builder.Configuration);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddDomainEvents<RevenueDbContext>();
builder.Services.AddSingleton<CodeSuggestionService>();
builder.Services.AddSingleton<Edi837Generator>();
builder.Services.AddSingleton<Edi835Parser>();
builder.Services.AddScoped<ClearinghouseClient>();
builder.Services.AddHttpClient("Clearinghouse", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
}).AddServiceResilienceHandler();
builder.Services.AddDaprClient();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<RevenueDbContext>("revenue");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "RevenueDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();
builder.Services.AddOutputCache(opts =>
{
    opts.AddPolicy("short", b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("status", "top", "skip", "patientId"));
});
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<RevenueDbContext>();
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
app.MapRevenueEndpoints();
app.MapDenialEndpoints();

app.MapPost("/api/v1/revenue/seed", async (RevenueDbContext db) =>
{
    if (await db.CodingJobs.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    var codingJobs = new[]
    {
        CodingJob.Create("ENC-2024-001", "PAT-001", "Sarah Johnson",    ["J06.9", "R05.9", "Z23"]),
        CodingJob.Create("ENC-2024-002", "PAT-002", "Michael Chen",     ["I10", "E11.65", "Z79.84"]),
        CodingJob.Create("ENC-2024-003", "PAT-003", "Emily Rodriguez",  ["M54.5", "M79.3", "G89.29"]),
        CodingJob.Create("ENC-2024-004", "PAT-004", "James Williams",   ["J45.20", "J30.1", "R06.2"]),
        CodingJob.Create("ENC-2024-005", "PAT-005", "Maria Garcia",     ["K21.0", "R10.13", "K29.70"]),
    };
    db.CodingJobs.AddRange(codingJobs);

    var priorAuths = new[]
    {
        PriorAuth.Create("PAT-001", "Sarah Johnson",   "MRI Brain w/o Contrast",      "70551", "Aetna"),
        PriorAuth.Create("PAT-002", "Michael Chen",    "Cardiac Catheterization",      "93458", "UnitedHealth"),
        PriorAuth.Create("PAT-003", "Emily Rodriguez", "Lumbar Epidural Injection",    "62323", "BlueCross"),
        PriorAuth.Create("PAT-004", "James Williams",  "Pulmonary Function Test",      "94010", "Cigna"),
    };
    db.PriorAuths.AddRange(priorAuths);

    // Submit some prior auths to simulate workflow
    priorAuths[0].Submit();
    priorAuths[1].Submit();
    priorAuths[1].Approve();
    priorAuths[2].Submit();

    // ── Claim denials — near-term appeal deadlines for demo urgency ───────────
    var today = DateTime.UtcNow;
    var denials = new[]
    {
        ClaimDenial.Create(codingJobs[0].Id, "CLM-20240301", "PAT-001", "BCBS",    "BlueCross BlueShield", "CO-4",  "Inconsistent modifier",                  DenialCategory.CodingError,        3200m, today.AddDays(6)),
        ClaimDenial.Create(codingJobs[1].Id, "CLM-20240285", "PAT-002", "AETNA",   "Aetna",                "PR-96", "Non-covered benefit",                    DenialCategory.PatientResponsibility, 1850m, today.AddDays(3)),
        ClaimDenial.Create(codingJobs[2].Id, "CLM-20240241", "PAT-003", "UNITED",  "UnitedHealth",         "CO-11", "Diagnosis inconsistent with procedure",  DenialCategory.MedicalNecessity,   7400m, today.AddDays(4)),
        ClaimDenial.Create(codingJobs[3].Id, "CLM-20240198", "PAT-004", "CIGNA",   "Cigna",                "CO-97", "Payment adjusted per contractual rate",  DenialCategory.Contractual,         920m, today.AddDays(21)),
        ClaimDenial.Create(codingJobs[0].Id, "CLM-20240177", "PAT-005", "HUMANA",  "Humana",               "CO-16", "Claim lacks required information",       DenialCategory.Eligibility,        4750m, today.AddDays(2)),
        ClaimDenial.Create(codingJobs[4].Id, "CLM-20240155", "PAT-005", "MEDICARE","Medicare",             "PR-27", "Expenses after benefit termination",     DenialCategory.CodingError,        2100m, today.AddDays(8)),
    };

    // Simulate in-progress appeal workflows
    denials[1].Appeal("Prior auth on file (PA-2024-00847). Non-covered determination disputed.");
    denials[5].Appeal("Patient enrollment confirmed. Benefits were active at date of service.");

    // Resolved denial — resubmitted
    denials[3].Resubmit();

    db.ClaimDenials.AddRange(denials);

    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", codingJobs = codingJobs.Length, priorAuths = priorAuths.Length, denials = denials.Length });
});

app.Run();

public partial class Program { }
