using FluentValidation;
using HealthQCopilot.Agents.BackgroundServices;
using HealthQCopilot.Agents.Endpoints;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Rag;
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
using Qdrant.Client;

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
    // Text embedding for RAG ingestion and retrieval (Microsoft.Extensions.AI)
    var embeddingDeployment = builder.Configuration["AzureOpenAI:EmbeddingDeploymentName"] ?? "text-embedding-ada-002";
    builder.Services.AddAzureOpenAIEmbeddingGenerator(embeddingDeployment, aoaiEndpoint, aoaiKey);
}

builder.Services.AddScoped<TriageOrchestrator>();
builder.Services.AddScoped<HallucinationGuardAgent>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<PlatformGuidePlugin>();
builder.Services.AddScoped<GuideOrchestrator>();
builder.Services.AddScoped<DemoOrchestrator>();
builder.Services.AddSingleton<DemoPlugin>();
// Phase 6 — Agentic AI plugins
builder.Services.AddSingleton<ClinicalCoderPlugin>();
builder.Services.AddSingleton<PriorAuthPlugin>();
builder.Services.AddSingleton<CareGapPlugin>();
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
    // Phase 6 — dynamic tool plugins for the agentic planning loop
    collection.AddFromObject(sp.GetRequiredService<ClinicalCoderPlugin>(), "ClinicalCoder");
    collection.AddFromObject(sp.GetRequiredService<PriorAuthPlugin>(), "PriorAuth");
    collection.AddFromObject(sp.GetRequiredService<CareGapPlugin>(), "CareGap");
    return collection;
});

builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "AgentDb");
builder.Services.AddDaprSecretProvider();

// ── Qdrant vector store (RAG — Items 18 & 19) ────────────────────────────────
var qdrantEndpoint = builder.Configuration["Qdrant:Endpoint"] ?? "http://localhost:6333";
builder.Services.AddSingleton(sp =>
{
    var uri = new Uri(qdrantEndpoint);
    return new QdrantClient(uri.Host, uri.Port, https: uri.Scheme == "https");
});
builder.Services.AddSingleton<IClinicalKnowledgeStore, QdrantKnowledgeStore>();
builder.Services.AddScoped<IRagContextProvider, RagContextProvider>();
builder.Services.AddHostedService<KnowledgeIngestionService>();
// Phase 6 — episodic memory, planning loop, clinical coder, XAI, A/B experiments
builder.Services.AddSingleton<IEpisodicMemoryService, EpisodicMemoryService>();
builder.Services.AddScoped<AgentPlanningLoop>();
builder.Services.AddScoped<ClinicalCoderAgent>();
builder.Services.AddScoped<XaiExplainabilityService>();
builder.Services.AddScoped<PromptExperimentService>();

// ── Model governance (Item 21) ────────────────────────────────────────────────
builder.Services.AddScoped<PromptRegressionEvaluator>();
builder.Services.AddHostedService<ModelDriftMonitorService>();

// ── IoT / Wearable streaming agent (Item 29) ──────────────────────────────────
builder.Services.AddHttpClient("fhir");
builder.Services.AddHttpClient("dapr");
builder.Services.AddHostedService<WearableStreamingAgent>();

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
app.MapModelGovernanceEndpoints();

app.Run();

public partial class Program { }
