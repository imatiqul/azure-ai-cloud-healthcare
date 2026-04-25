using FluentValidation;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Resilience;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
using HealthQCopilot.Notifications.Endpoints;
using HealthQCopilot.Notifications.Infrastructure;
using HealthQCopilot.Notifications.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "notification-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<NotificationDbContext>(
    builder.Configuration, "NotificationDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<NotificationDbContext>(builder.Configuration);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddDomainEvents<NotificationDbContext>();
builder.Services.AddScoped<INotificationSender, AcsNotificationSender>();
builder.Services.AddScoped<WebPushSender>();
builder.Services.AddHttpClient("WebPush").AddServiceResilienceHandler();
builder.Services.AddHttpClient("IdentityService", client =>
{
    var apiBase = builder.Configuration["Services:ApiBase"] ?? "http://localhost:5050";
    client.BaseAddress = new Uri(apiBase.TrimEnd('/') + "/");
}).AddServiceResilienceHandler();
builder.Services.AddHostedService<CampaignDispatchService>();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<NotificationDbContext>("notification");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "NotificationDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddEventHubAudit();
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<NotificationDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseCloudEvents();
app.UseMiddleware<TenantContextMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapSubscribeHandler();
app.MapDefaultEndpoints();
app.MapNotificationEndpoints();

app.Run();

public partial class Program { }
