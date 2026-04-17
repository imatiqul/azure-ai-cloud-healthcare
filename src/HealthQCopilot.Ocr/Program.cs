using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Ocr.Endpoints;
using HealthQCopilot.Ocr.Infrastructure;
using HealthQCopilot.Ocr.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "ocr-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddDbContext<OcrDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("OcrDb")));
builder.Services.AddOutboxRelay<OcrDbContext>(builder.Configuration);
builder.Services.AddScoped<IDocumentProcessor, AzureDocumentProcessor>();
builder.Services.AddHostedService<OcrProcessingService>();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<OcrDbContext>("ocr");

var app = builder.Build();

await app.InitializeDatabaseAsync<OcrDbContext>();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapOcrEndpoints();

app.Run();

public partial class Program { }
