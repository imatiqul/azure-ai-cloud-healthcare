using FluentValidation;
using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
using HealthQCopilot.Scheduling.BackgroundServices;
using HealthQCopilot.Scheduling.Endpoints;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "scheduling-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<SchedulingDbContext>(
    builder.Configuration, "SchedulingDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<SchedulingDbContext>(builder.Configuration);
builder.Services.AddHostedService<SlotGenerationService>();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<SchedulingDbContext>("scheduling");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "SchedulingDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();
builder.Services.AddDaprClient();
builder.Services.AddScoped<HealthQCopilot.Scheduling.Services.WaitlistService>();
builder.Services.AddOutputCache(opts =>
{
    opts.AddPolicy("short", b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("date", "practitionerId", "top"));
});
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<SchedulingDbContext>();
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
app.MapSchedulingEndpoints();
app.MapWaitlistEndpoints();
app.MapPractitionerEndpoints();

app.MapPost("/api/v1/scheduling/seed", async (SchedulingDbContext db) =>
{
    if (await db.Slots.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    // ── Practitioners ─────────────────────────────────────────────────────────
    var pracRecords = new[]
    {
        Practitioner.Create("DR-001", "Dr. Robert Smith",    "Cardiology",        "r.smith@healthq.demo",    new TimeOnly(9,0), new TimeOnly(17,0)),
        Practitioner.Create("DR-002", "Dr. Ananya Patel",    "Pulmonology",       "a.patel@healthq.demo",    new TimeOnly(8,0), new TimeOnly(16,0)),
        Practitioner.Create("DR-003", "Dr. Timothy Johnson", "General Surgery",   "t.johnson@healthq.demo",  new TimeOnly(10,0), new TimeOnly(18,0)),
        Practitioner.Create("DR-004", "Dr. Lisa Nguyen",     "Endocrinology",     "l.nguyen@healthq.demo",   new TimeOnly(9,0), new TimeOnly(17,0)),
    };
    db.Practitioners.AddRange(pracRecords);

    // ── Appointment slots — 7 days rolling for all 4 practitioners ─────────
    var today = DateTime.UtcNow.Date;
    var practitionerIds = pracRecords.Select(p => p.PractitionerId).ToArray();
    var slots = new List<Slot>();
    foreach (var practitionerId in practitionerIds)
    {
        for (var dayOffset = 0; dayOffset < 7; dayOffset++)
        {
            var date = today.AddDays(dayOffset);
            for (var hour = 9; hour < 17; hour++)
            {
                slots.Add(Slot.Create(Guid.NewGuid(), practitionerId,
                    date.AddHours(hour), date.AddHours(hour).AddMinutes(30)));
                slots.Add(Slot.Create(Guid.NewGuid(), practitionerId,
                    date.AddHours(hour).AddMinutes(30), date.AddHours(hour + 1)));
            }
        }
    }
    db.Slots.AddRange(slots);

    // ── Waitlist entries ─────────────────────────────────────────────────────
    var todayOnly = DateOnly.FromDateTime(today);
    var waitlist = new[]
    {
        WaitlistEntry.Create("PAT-001", "DR-002", todayOnly.AddDays(2), todayOnly.AddDays(7),  priority: 1, reason: "Urgent cardiac follow-up post-exacerbation"),
        WaitlistEntry.Create("PAT-002", "DR-001", todayOnly.AddDays(3), todayOnly.AddDays(10), priority: 2, reason: "COPD management consultation"),
        WaitlistEntry.Create("PAT-003", "DR-003", todayOnly.AddDays(5), todayOnly.AddDays(14), priority: 3, reason: "Pre-op surgical clearance"),
        WaitlistEntry.Create("PAT-004", "DR-002", todayOnly.AddDays(4), todayOnly.AddDays(12), priority: 2, reason: "Insulin adjustment needed — recent A1C spike"),
        WaitlistEntry.Create("PAT-005", "DR-004", todayOnly.AddDays(7), todayOnly.AddDays(21), priority: 3, reason: "Dyslipidemia management and statin initiation"),
    };
    db.WaitlistEntries.AddRange(waitlist);

    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", practitioners = pracRecords.Length, slots = slots.Count, waitlist = waitlist.Length });
});

app.Run();

public partial class Program { }
