using FluentValidation;
using HealthQCopilot.Domain.Scheduling;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Scheduling.Endpoints;
using HealthQCopilot.Scheduling.Infrastructure;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "scheduling-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddDbContext<SchedulingDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("SchedulingDb"))
       .AddInterceptors(new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
                        new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor()));
builder.Services.AddOutboxRelay<SchedulingDbContext>(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<SchedulingDbContext>("scheduling");

var app = builder.Build();

await app.InitializeDatabaseAsync<SchedulingDbContext>();

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
        for (var hour = 8; hour < 17; hour++)
        {
            slots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                today.AddHours(hour), today.AddHours(hour).AddMinutes(30)));
            slots.Add(Slot.Create(Guid.NewGuid(), practitioner,
                today.AddHours(hour).AddMinutes(30), today.AddHours(hour + 1)));
        }
    }
    db.Slots.AddRange(slots);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", slots = slots.Count });
});

app.Run();

public partial class Program { }
