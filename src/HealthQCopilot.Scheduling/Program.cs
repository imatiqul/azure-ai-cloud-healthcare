using FluentValidation;
using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Security;
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

var app = builder.Build();

await app.InitializeDatabaseAsync<SchedulingDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapSchedulingEndpoints();

app.MapPost("/api/v1/scheduling/seed", async (SchedulingDbContext db) =>
{
    if (await db.Slots.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    var today = DateTime.UtcNow.Date;
    var practitioners = new[] { "DR-001", "DR-002", "DR-003" };
    var slots = new List<Slot>();
    foreach (var practitioner in practitioners)
    {
        for (var dayOffset = 0; dayOffset < 7; dayOffset++)
        {
            var date = today.AddDays(dayOffset);
            for (var hour = 9; hour < 17; hour++)
            {
                slots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                    date.AddHours(hour), date.AddHours(hour).AddMinutes(30)));
                slots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                    date.AddHours(hour).AddMinutes(30), date.AddHours(hour + 1)));
            }
        }
    }
    db.Slots.AddRange(slots);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", slots = slots.Count });
});

app.Run();

public partial class Program { }
