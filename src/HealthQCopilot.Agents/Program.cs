using FluentValidation;
using HealthQCopilot.Agents.BackgroundServices;
using HealthQCopilot.Agents.Endpoints;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Agents.Services.Orchestration;
using HealthQCopilot.Agents.Services.Safety;
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

    // W1.2 — kernel-level decorator: every IChatCompletionService call (auto-tool
    // loops, planner reflection, streaming) is wrapped with PHI redaction +
    // token-ledger recording. Activated by HealthQ:PhiRedaction / TokenAccounting
    // feature flags inside the decorator itself, so it's safe to register
    // unconditionally.
    var aoaiDescriptor = builder.Services.LastOrDefault(s =>
        s.ServiceType == typeof(Microsoft.SemanticKernel.ChatCompletion.IChatCompletionService));
    if (aoaiDescriptor is not null)
    {
        builder.Services.Remove(aoaiDescriptor);
        builder.Services.AddSingleton<Microsoft.SemanticKernel.ChatCompletion.IChatCompletionService>(sp =>
        {
            var inner = (Microsoft.SemanticKernel.ChatCompletion.IChatCompletionService)
                (aoaiDescriptor.ImplementationInstance
                 ?? aoaiDescriptor.ImplementationFactory?.Invoke(sp)
                 ?? ActivatorUtilities.CreateInstance(sp, aoaiDescriptor.ImplementationType!));
            return new HealthQCopilot.Agents.Services.Safety.RedactingChatCompletionDecorator(
                inner,
                sp.GetRequiredService<HealthQCopilot.Infrastructure.AI.IPhiRedactor>(),
                sp.GetRequiredService<HealthQCopilot.Infrastructure.AI.ITokenLedger>(),
                sp.GetRequiredService<HealthQCopilot.Infrastructure.AI.IModelPricing>(),
                sp.GetRequiredService<Microsoft.FeatureManagement.IFeatureManager>(),
                sp.GetRequiredService<ILogger<HealthQCopilot.Agents.Services.Safety.RedactingChatCompletionDecorator>>(),
                sp.GetService<HealthQCopilot.Infrastructure.AI.IAgentTraceRecorder>());
        });
    }
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

// W5.2 — live tool events streamed to the Agent Trace UI via Web PubSub.
// SK auto-attaches all DI-registered IFunctionInvocationFilter instances to the resolved kernel.
builder.Services.AddScoped<Microsoft.SemanticKernel.IFunctionInvocationFilter, HealthQCopilot.Agents.Infrastructure.LiveToolEventFilter>();
// W2.4 — tool RBAC enforcement at the SK function-invocation seam. Open by
// default; flips to deny-by-policy when HealthQ:ToolRbac is on.
builder.Services.AddScoped<Microsoft.SemanticKernel.IFunctionInvocationFilter, HealthQCopilot.Agents.Infrastructure.ToolPolicyFilter>();

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
// W4.2 — model pricing for cost attribution; defaults to 0$ when section absent.
builder.Services.Configure<HealthQCopilot.Infrastructure.AI.PricingOptions>(
    builder.Configuration.GetSection(HealthQCopilot.Infrastructure.AI.PricingOptions.SectionName));
builder.Services.AddSingleton<HealthQCopilot.Infrastructure.AI.IModelPricing, HealthQCopilot.Infrastructure.AI.ConfiguredModelPricing>();
// W3.1 — Clinical accuracy harness (golden-set evaluator).
builder.Services.Configure<HealthQCopilot.Agents.Evaluation.ClinicalEvalOptions>(
    builder.Configuration.GetSection(HealthQCopilot.Agents.Evaluation.ClinicalEvalOptions.SectionName));
builder.Services.AddSingleton<HealthQCopilot.Agents.Evaluation.IClinicalCaseLoader,
    HealthQCopilot.Agents.Evaluation.FileClinicalCaseLoader>();
builder.Services.AddSingleton<HealthQCopilot.Agents.Evaluation.IGroundednessJudge,
    HealthQCopilot.Agents.Evaluation.LlmGroundednessJudge>();
// W3.3 — toxicity / bias screener. Defaults to Noop; switches to Azure Content Safety when endpoint configured.
builder.Services.Configure<HealthQCopilot.Agents.Evaluation.ToxicityScreenerOptions>(
    builder.Configuration.GetSection(HealthQCopilot.Agents.Evaluation.ToxicityScreenerOptions.SectionName));
var contentSafetyEndpoint = builder.Configuration[$"{HealthQCopilot.Agents.Evaluation.ToxicityScreenerOptions.SectionName}:Endpoint"];
if (!string.IsNullOrWhiteSpace(contentSafetyEndpoint))
{
    builder.Services.AddHttpClient<HealthQCopilot.Agents.Evaluation.AzureContentSafetyToxicityScreener>();
    builder.Services.AddSingleton<HealthQCopilot.Agents.Evaluation.IToxicityScreener>(
        sp => sp.GetRequiredService<HealthQCopilot.Agents.Evaluation.AzureContentSafetyToxicityScreener>());
}
else
{
    builder.Services.AddSingleton<HealthQCopilot.Agents.Evaluation.IToxicityScreener,
        HealthQCopilot.Agents.Evaluation.NoopToxicityScreener>();
}
builder.Services.AddSingleton<HealthQCopilot.Infrastructure.AI.IClinicalEvaluator,
    HealthQCopilot.Agents.Evaluation.ClinicalEvaluator>();
builder.Services.AddSingleton<PromptRegistry>();
builder.Services.AddSingleton<IPromptRegistry>(sp => sp.GetRequiredService<PromptRegistry>());
// ── Phase 1 Contracts (W1–W5) — feature-flag gated, default no-op safe ──
builder.Services.Configure<AgentBudgetOptions>(builder.Configuration.GetSection(AgentBudgetOptions.SectionName));
builder.Services.Configure<AgentToolPolicyOptions>(builder.Configuration.GetSection(AgentToolPolicyOptions.SectionName));
builder.Services.Configure<PresidioOptions>(builder.Configuration.GetSection(PresidioOptions.SectionName));
// W1.1 — prefer Presidio sidecar when configured; otherwise the regex
// fallback continues to satisfy the IPhiRedactor contract so existing tests
// and dev environments keep working without infra changes.
builder.Services.AddSingleton<RegexPhiRedactor>();
var presidioEndpoint = builder.Configuration[$"{PresidioOptions.SectionName}:AnalyzerEndpoint"];
if (!string.IsNullOrWhiteSpace(presidioEndpoint))
{
    builder.Services.AddHttpClient<PresidioPhiRedactor>(client =>
    {
        client.BaseAddress = new Uri(presidioEndpoint.TrimEnd('/') + "/");
    });
    // Transient so each resolution picks up a fresh typed HttpClient and the
    // underlying socket pool is reused via IHttpClientFactory.
    builder.Services.AddTransient<IPhiRedactor>(sp => sp.GetRequiredService<PresidioPhiRedactor>());
}
else
{
    builder.Services.AddSingleton<IPhiRedactor>(sp => sp.GetRequiredService<RegexPhiRedactor>());
}

// W4.1 — Cosmos-backed token ledger when configured; otherwise in-memory fallback.
builder.Services.Configure<HealthQCopilot.Infrastructure.AI.CosmosOptions>(
    builder.Configuration.GetSection(HealthQCopilot.Infrastructure.AI.CosmosOptions.SectionName));
var cosmosEndpoint = builder.Configuration[$"{HealthQCopilot.Infrastructure.AI.CosmosOptions.SectionName}:Endpoint"];
if (!string.IsNullOrWhiteSpace(cosmosEndpoint))
{
    builder.Services.AddSingleton(sp =>
    {
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthQCopilot.Infrastructure.AI.CosmosOptions>>().Value;
        var clientOpts = new Microsoft.Azure.Cosmos.CosmosClientOptions
        {
            ApplicationName = "HealthQCopilot.Agents",
            SerializerOptions = new Microsoft.Azure.Cosmos.CosmosSerializationOptions
            {
                PropertyNamingPolicy = Microsoft.Azure.Cosmos.CosmosPropertyNamingPolicy.CamelCase,
            },
        };
        return string.IsNullOrEmpty(opts.AccountKey)
            ? new Microsoft.Azure.Cosmos.CosmosClient(opts.Endpoint, new Azure.Identity.DefaultAzureCredential(), clientOpts)
            : new Microsoft.Azure.Cosmos.CosmosClient(opts.Endpoint, opts.AccountKey, clientOpts);
    });
    builder.Services.AddSingleton<ITokenLedger>(sp =>
    {
        var client = sp.GetRequiredService<Microsoft.Azure.Cosmos.CosmosClient>();
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthQCopilot.Infrastructure.AI.CosmosOptions>>().Value;
        var db = client.CreateDatabaseIfNotExistsAsync(opts.Database).GetAwaiter().GetResult();
        var container = db.Database
            .CreateContainerIfNotExistsAsync(new Microsoft.Azure.Cosmos.ContainerProperties(opts.TokenLedgerContainer, "/sessionId")
            {
                DefaultTimeToLive = opts.TokenLedgerTtlSeconds,
            }).GetAwaiter().GetResult();
        return new HealthQCopilot.Infrastructure.AI.CosmosTokenLedger(
            container.Container,
            sp.GetRequiredService<ILlmUsageTracker>(),
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthQCopilot.Infrastructure.AI.CosmosOptions>>(),
            sp.GetRequiredService<ILogger<HealthQCopilot.Infrastructure.AI.CosmosTokenLedger>>());
    });

    // W4.5 — Cosmos-backed prompt registry decorating the App-Config registry.
    builder.Services.AddSingleton<HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry>(sp =>
    {
        var client = sp.GetRequiredService<Microsoft.Azure.Cosmos.CosmosClient>();
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthQCopilot.Infrastructure.AI.CosmosOptions>>().Value;
        var db = client.CreateDatabaseIfNotExistsAsync(opts.Database).GetAwaiter().GetResult();
        var container = db.Database
            .CreateContainerIfNotExistsAsync(
                new Microsoft.Azure.Cosmos.ContainerProperties(opts.PromptRegistryContainer, "/promptKey"))
            .GetAwaiter().GetResult();
        return new HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry(
            container.Container,
            sp.GetRequiredService<PromptRegistry>(),
            sp.GetRequiredService<HealthQCopilot.Infrastructure.Caching.ICacheService>(),
            sp.GetRequiredService<ILogger<HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry>>());
    });
    // Replace the default IPromptRegistry registration with the Cosmos-decorated one.
    var defaultPromptDescriptor = builder.Services.LastOrDefault(s => s.ServiceType == typeof(IPromptRegistry));
    if (defaultPromptDescriptor is not null)
        builder.Services.Remove(defaultPromptDescriptor);
    builder.Services.AddSingleton<IPromptRegistry>(sp => sp.GetRequiredService<HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry>());
    builder.Services.AddSingleton<HealthQCopilot.Infrastructure.AI.IPromptRegistryAdmin>(sp => sp.GetRequiredService<HealthQCopilot.Infrastructure.AI.CosmosPromptRegistry>());
}
else
{
    builder.Services.AddSingleton<ITokenLedger, InMemoryTokenLedger>();
}
builder.Services.AddSingleton<IAgentRouter, ConfidenceBasedAgentRouter>();
builder.Services.AddSingleton<IConsentService, DefaultConsentService>();
builder.Services.AddSingleton<IAgentTraceRecorder, InMemoryAgentTraceRecorder>();
builder.Services.AddSingleton<IRedactingLlmGateway, RedactingLlmGateway>();
// W5.6 — process-local registry that lets POST /agents/sessions/{id}/cancel
// trip the in-flight AgentPlanningLoop's CancellationToken.
builder.Services.AddSingleton<IAgentSessionCancellationRegistry, AgentSessionCancellationRegistry>();
builder.Services.AddHostedService<AzureOpenAIResidencyValidator>();
// W2 \u2014 multi-agent orchestration scaffolding
builder.Services.AddSingleton<IGoalDecomposer, HeuristicGoalDecomposer>();
builder.Services.AddScoped<IAgentHandoffCoordinator, AgentHandoffCoordinator>();
builder.Services.AddScoped<IToolPolicyEnforcer, ToolPolicyEnforcer>();
builder.Services.AddScoped<AgentBudgetTracker>();
builder.Services.AddScoped<ConfidenceRouter>();
// W2.3 \u2014 cross-agent validator (LLM-as-judge over RAG citations).
builder.Services.AddScoped<ICriticAgent, CriticAgent>();// W4.5 — versioned prompt registry. In-memory seed today; Cosmos-backed swap-in later.
builder.Services.AddSingleton<HealthQCopilot.Agents.Prompts.InMemoryPromptRegistry>();
// W4.5b — when Cosmos is configured, decorate the in-memory registry with a
// Cosmos-backed lookup that reads the active "default" tenant prompt for each
// id and falls through to the in-memory seed on miss / storage failure. The
// container schema is shared with the older async CosmosPromptRegistry
// (partition /promptKey, id "{promptKey}:{tenantId}:{version}", active=true).
if (!string.IsNullOrEmpty(builder.Configuration["Cosmos:Endpoint"]))
{
    builder.Services.AddSingleton<HealthQCopilot.Agents.Prompts.IAgentPromptRegistry>(sp =>
    {
        var client = sp.GetRequiredService<Microsoft.Azure.Cosmos.CosmosClient>();
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthQCopilot.Infrastructure.AI.CosmosOptions>>().Value;
        var db = client.CreateDatabaseIfNotExistsAsync(opts.Database).GetAwaiter().GetResult();
        var container = db.Database
            .CreateContainerIfNotExistsAsync(
                new Microsoft.Azure.Cosmos.ContainerProperties(opts.PromptRegistryContainer, "/promptKey"))
            .GetAwaiter().GetResult();
        return new HealthQCopilot.Agents.Prompts.CosmosAgentPromptRegistry(
            container.Container,
            sp.GetRequiredService<HealthQCopilot.Agents.Prompts.InMemoryPromptRegistry>(),
            sp.GetRequiredService<ILogger<HealthQCopilot.Agents.Prompts.CosmosAgentPromptRegistry>>());
    });
}
else
{
    builder.Services.AddSingleton<HealthQCopilot.Agents.Prompts.IAgentPromptRegistry>(
        sp => sp.GetRequiredService<HealthQCopilot.Agents.Prompts.InMemoryPromptRegistry>());
}builder.Services.AddOutputCache(opts =>
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
app.MapAgentTraceEndpoints();
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
