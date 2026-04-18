using FluentValidation;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Security;
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
builder.Services.AddSingleton<CodeSuggestionService>();
builder.Services.AddDaprClient();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<RevenueDbContext>("revenue");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "RevenueDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();

var app = builder.Build();

await app.InitializeDatabaseAsync<RevenueDbContext>();
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
app.MapRevenueEndpoints();

app.MapPost("/api/v1/revenue/seed", async (RevenueDbContext db) =>
{
    if (await db.CodingJobs.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    var codingJobs = new[]
    {
        CodingJob.Create("ENC-2024-001", "PAT-001", "Sarah Johnson", ["J06.9", "R05.9", "Z23"]),
        CodingJob.Create("ENC-2024-002", "PAT-002", "Michael Chen", ["I10", "E11.65", "Z79.84"]),
        CodingJob.Create("ENC-2024-003", "PAT-003", "Emily Rodriguez", ["M54.5", "M79.3", "G89.29"]),
        CodingJob.Create("ENC-2024-004", "PAT-004", "James Williams", ["J45.20", "J30.1", "R06.2"]),
        CodingJob.Create("ENC-2024-005", "PAT-005", "Maria Garcia", ["K21.0", "R10.13", "K29.70"]),
    };
    db.CodingJobs.AddRange(codingJobs);

    var priorAuths = new[]
    {
        PriorAuth.Create("PAT-001", "Sarah Johnson", "MRI Brain w/o Contrast", "70551", "Aetna"),
        PriorAuth.Create("PAT-002", "Michael Chen", "Cardiac Catheterization", "93458", "UnitedHealth"),
        PriorAuth.Create("PAT-003", "Emily Rodriguez", "Lumbar Epidural Injection", "62323", "BlueCross"),
        PriorAuth.Create("PAT-004", "James Williams", "Pulmonary Function Test", "94010", "Cigna"),
    };
    db.PriorAuths.AddRange(priorAuths);

    // Submit some prior auths to simulate workflow
    priorAuths[0].Submit();
    priorAuths[1].Submit();
    priorAuths[1].Approve();
    priorAuths[2].Submit();

    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", codingJobs = codingJobs.Length, priorAuths = priorAuths.Length });
});

app.Run();

public partial class Program { }
