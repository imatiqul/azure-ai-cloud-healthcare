using FluentValidation;
using HealthQCopilot.Agents.Endpoints;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;

#pragma warning disable SKEXP0010 // Azure OpenAI connector is experimental

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "ai-agent-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<AgentDbContext>(
    builder.Configuration, "AgentDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<AgentDbContext>(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<AgentDbContext>("agent");

builder.Services.AddKernel();

// Conditionally add Azure OpenAI when configured
var aoaiEndpoint = builder.Configuration["AzureOpenAI:Endpoint"];
var aoaiDeployment = builder.Configuration["AzureOpenAI:DeploymentName"];
var aoaiKey = builder.Configuration["AzureOpenAI:ApiKey"];
if (!string.IsNullOrEmpty(aoaiEndpoint) && !string.IsNullOrEmpty(aoaiDeployment) && !string.IsNullOrEmpty(aoaiKey))
{
    builder.Services.AddAzureOpenAIChatCompletion(aoaiDeployment, aoaiEndpoint, aoaiKey);
}

builder.Services.AddScoped<TriageOrchestrator>();
builder.Services.AddScoped<HallucinationGuardAgent>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<PlatformGuidePlugin>();
builder.Services.AddScoped<GuideOrchestrator>();
builder.Services.AddScoped<DemoOrchestrator>();
builder.Services.AddSingleton<DemoPlugin>();
// WorkflowDispatcher: dispatches cross-service calls via APIM after triage completes
var apiBase = builder.Configuration["Services:ApiBase"] ?? "https://healthq-copilot-apim.azure-api.net";
builder.Services.AddHttpClient<WorkflowDispatcher>(client =>
{
    client.BaseAddress = new Uri(apiBase);
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<WorkflowDispatcher>();
// DaprClient for publishing events to pub/sub
builder.Services.AddDaprClient();
// Register Semantic Kernel plugins
builder.Services.AddSingleton(sp =>
{
    var collection = new KernelPluginCollection();
    collection.AddFromType<TriagePlugin>("Triage");
    collection.AddFromObject(sp.GetRequiredService<PlatformGuidePlugin>(), "PlatformGuide");
    collection.AddFromObject(sp.GetRequiredService<DemoPlugin>(), "Demo");
    return collection;
});

builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "AgentDb");
builder.Services.AddDaprSecretProvider();

// Azure Web PubSub — push AI thinking tokens + agent responses to frontend
builder.Services.AddWebPubSubService();

// Azure Event Hubs — HIPAA-compliant immutable audit trail
builder.Services.AddEventHubAudit();

var app = builder.Build();

await app.InitializeDatabaseAsync<AgentDbContext>();
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
app.MapAgentEndpoints();
app.MapGuideEndpoints();
app.MapDemoEndpoints();

app.Run();

public partial class Program { }
