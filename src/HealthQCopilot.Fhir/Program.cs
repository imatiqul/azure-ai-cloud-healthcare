using HealthQCopilot.Fhir.Endpoints;
using HealthQCopilot.Fhir.Persistence;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "fhir-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddDbContext<FhirDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("FhirDb")));
builder.Services.AddOutboxRelay<FhirDbContext>(builder.Configuration);
builder.Services.AddFhirHttpClient(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<FhirDbContext>("fhir");

var app = builder.Build();

await app.InitializeDatabaseAsync<FhirDbContext>();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapFhirEndpoints();

app.Run();

public partial class Program { }
