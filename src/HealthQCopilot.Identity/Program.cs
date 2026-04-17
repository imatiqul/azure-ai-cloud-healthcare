using FluentValidation;
using HealthQCopilot.Identity.Endpoints;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "identity-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddDbContext<IdentityDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("IdentityDb"))
       .AddInterceptors(new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
                        new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor()));
builder.Services.AddOutboxRelay<IdentityDbContext>(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<IdentityDbContext>("identity");

var app = builder.Build();

await app.InitializeDatabaseAsync<IdentityDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapIdentityEndpoints();

app.Run();

public partial class Program { }
