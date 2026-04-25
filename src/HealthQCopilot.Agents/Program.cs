using FluentValidation;
using HealthQCopilot.Agents.BackgroundServices;
using HealthQCopilot.Agents.Endpoints;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.Infrastructure.Resilience;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
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
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddDomainEvents<AgentDbContext>();
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
// Phase 3 — Microservice API plugins (Patient / Clinical / Scheduling)
builder.Services.AddSingleton<PatientPlugin>();
builder.Services.AddSingleton<ClinicalPlugin>();
builder.Services.AddSingleton<SchedulingPlugin>();
// WorkflowDispatcher: dispatches cross-service calls via APIM after triage completes
var apiBase = builder.Configuration["Services:ApiBase"] ?? "https://healthq-copilot-apim.azure-api.net";
builder.Services.AddHttpClient<WorkflowDispatcher>(client =>
{
    client.BaseAddress = new Uri(apiBase);
    client.Timeout = TimeSpan.FromSeconds(15);
}).AddServiceResilienceHandler();
builder.Services.AddScoped<WorkflowDispatcher>();
builder.Services.AddScoped<HealthQCopilot.Agents.Sagas.BookingOrchestrationSaga>();
// Named HTTP clients for SK microservice API plugins — resolved via Aspire service discovery
builder.Services.AddHttpClient("fhir-service", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration.GetConnectionString("fhir-service")
        ?? builder.Configuration["Services:Fhir"]
        ?? "http://fhir-service");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddHttpClient("pophealth-service", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration.GetConnectionString("pophealth-service")
        ?? builder.Configuration["Services:PopHealth"]
        ?? "http://pophealth-service");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddHttpClient("scheduling-service", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration.GetConnectionString("scheduling-service")
        ?? builder.Configuration["Services:Scheduling"]
        ?? "http://scheduling-service");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddHttpClient("notification-service", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration.GetConnectionString("notification-service")
        ?? builder.Configuration["Services:Notifications"]
        ?? "http://notification-service");
    client.Timeout = TimeSpan.FromSeconds(10);
});
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
    // Phase 3 — Microservice API plugins
    collection.AddFromObject(sp.GetRequiredService<PatientPlugin>(), "Patient");
    collection.AddFromObject(sp.GetRequiredService<ClinicalPlugin>(), "Clinical");
    collection.AddFromObject(sp.GetRequiredService<SchedulingPlugin>(), "Scheduling");
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
builder.Services.AddScoped<ClinicianFeedbackService>();
builder.Services.AddSingleton<ClinicianFeedbackRepository>();
builder.Services.AddHostedService<ModelDriftMonitorService>();

// ── IoT / Wearable streaming agent (Item 29) ──────────────────────────────────
builder.Services.AddHttpClient("fhir").AddServiceResilienceHandler();
builder.Services.AddHttpClient("dapr");
builder.Services.AddHostedService<WearableStreamingAgent>();

// Azure Web PubSub — push AI thinking tokens + agent responses to frontend
builder.Services.AddWebPubSubService();

// Azure Event Hubs — HIPAA-compliant immutable audit trail
builder.Services.AddEventHubAudit();

// ── Phase 39 — AI & Cloud Architecture improvements ───────────────────────────
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<ILlmUsageTracker, LlmUsageTracker>();
builder.Services.AddSingleton<IPromptRegistry, PromptRegistry>();
builder.Services.AddScoped<ConfidenceRouter>();
builder.Services.AddOutputCache(opts =>
{
    opts.AddPolicy("short", b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("top", "status"));
});
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<AgentDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseCloudEvents();
app.UseMiddleware<TenantContextMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseMiddleware<IdempotencyMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapSubscribeHandler();
app.MapDefaultEndpoints();
app.MapAgentEndpoints();
app.MapWorkflowOperationalEndpoints();
app.MapGuideEndpoints();
app.MapDemoEndpoints();
app.MapModelGovernanceEndpoints();
app.MapDemoDataEndpoints();

// ── Agents seed endpoint (idempotent) ────────────────────────────────────────
app.MapPost("/api/v1/agents/seed", async (AgentDbContext db) =>
{
    if (await db.TriageWorkflows.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    // Triage workflows — mix of active (P1) and resolved (P2/P3)
    var tw1 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-001", "Chest pain + dyspnoea at rest. Troponin I elevated at 1.8 ng/mL. 12-lead ECG shows ST elevation in V1-V4. STEMI protocol initiated, cath lab on standby.");
    tw1.AssignTriage(TriageLevel.P1_Immediate, "STEMI — time-critical catheterisation required within 90 minutes.");

    var tw2 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-002", "Elevated troponin 0.4 ng/mL in NSTEMI presentation. BP 148/92. Echo ordered to evaluate wall motion abnormality and LV function.");
    tw2.AssignTriage(TriageLevel.P2_Urgent, "NSTEMI — echo and cardiology consult placed, monitoring bed assigned.");

    var tw3 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-003", "Routine hypertension follow-up. BP 145/92 at home. No target organ damage. Patient requesting medication adjustment.");
    tw3.AssignTriage(TriageLevel.P3_Standard, "Hypertension — dose titration, telehealth follow-up arranged.");

    var tw4 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-004", "Anaphylaxis post bee sting. Urticaria, angioedema, BP 78/48, O2Sat 91%. Epinephrine 0.3mg IM administered. IV access obtained.");
    tw4.AssignTriage(TriageLevel.P1_Immediate, "Anaphylaxis — immediate resus. ICU bed requested.");

    var tw5 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-005", "RLQ pain, rebound tenderness, Rovsing sign positive. CT abdomen confirms appendicitis. WBC 14.2k.");
    tw5.AssignTriage(TriageLevel.P2_Urgent, "Appendicitis confirmed — surgical consult placed for same-day appendectomy.");

    var tw6 = TriageWorkflow.Create(Guid.NewGuid(), "SES-DEMO-006", "Mild URI symptoms — sore throat, rhinorrhea, low-grade fever 37.8°C. Flu and COVID rapid tests negative. No respiratory distress.");
    tw6.AssignTriage(TriageLevel.P3_Standard, "Viral URI — supportive care advised, telehealth follow-up if no improvement in 7 days.");

    db.TriageWorkflows.AddRange(tw1, tw2, tw3, tw4, tw5, tw6);

    // Escalation queue for P1 cases
    var esc1 = EscalationQueueItem.Create(tw1.Id, tw1.SessionId, TriageLevel.P1_Immediate);
    var esc2 = EscalationQueueItem.Create(tw4.Id, tw4.SessionId, TriageLevel.P1_Immediate);
    db.EscalationQueue.AddRange(esc1, esc2);

    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", workflows = 6, escalations = 2 });
})
.WithTags("Seed")
.WithSummary("Seed demo triage workflows and escalations (idempotent)");

app.Run();

public partial class Program { }
