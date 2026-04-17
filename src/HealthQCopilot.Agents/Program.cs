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
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;

#pragma warning disable SKEXP0010 // Azure OpenAI connector is experimental

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "ai-agent-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddDbContext<AgentDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("AgentDb"))
       .AddInterceptors(new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
                        new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor()));
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
builder.Services.AddHttpClient();
builder.Services.AddSingleton<PlatformGuidePlugin>();
builder.Services.AddScoped<GuideOrchestrator>();

// Register Semantic Kernel plugins
builder.Services.AddSingleton(sp =>
{
    var collection = new KernelPluginCollection();
    collection.AddFromType<TriagePlugin>("Triage");
    collection.AddFromObject(sp.GetRequiredService<PlatformGuidePlugin>(), "PlatformGuide");
    return collection;
});

var app = builder.Build();

await app.InitializeDatabaseAsync<AgentDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapAgentEndpoints();
app.MapGuideEndpoints();

app.Run();

public partial class Program { }
