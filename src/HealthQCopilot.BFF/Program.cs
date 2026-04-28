using HealthQCopilot.BFF.DataLoaders;
using HealthQCopilot.BFF.Services;
using HealthQCopilot.BFF.Types;
using HealthQCopilot.Infrastructure.Resilience;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// ── Typed HTTP clients — one per downstream microservice ──────────────────
builder.Services.AddHttpClient<PopHealthApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("pophealth-service")
        ?? builder.Configuration["Services:PopHealth"]
        ?? "http://pophealth-service")).AddServiceResilienceHandler();

builder.Services.AddHttpClient<AgentApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("agent-service")
        ?? builder.Configuration["Services:Agents"]
        ?? "http://agent-service")).AddServiceResilienceHandler();

builder.Services.AddHttpClient<RevenueApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("revenue-service")
        ?? builder.Configuration["Services:Revenue"]
        ?? "http://revenue-service")).AddServiceResilienceHandler();

builder.Services.AddHttpClient<SchedulingApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("scheduling-service")
        ?? builder.Configuration["Services:Scheduling"]
        ?? "http://scheduling-service")).AddServiceResilienceHandler();

builder.Services.AddHttpClient<FhirApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("fhir-service")
        ?? builder.Configuration["Services:Fhir"]
        ?? "http://fhir-service")).AddServiceResilienceHandler();

builder.Services.AddHttpClient<VoiceApiClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration.GetConnectionString("voice-service")
        ?? builder.Configuration["Services:Voice"]
        ?? "http://voice-service")).AddServiceResilienceHandler();

// ── Hot Chocolate GraphQL server ─────────────────────────────────────────
builder.Services
    .AddGraphQLServer()
    .AddQueryType<QueryType>()
    .AddMutationType<MutationType>()
    .AddSubscriptionType<SubscriptionType>()
    .AddDataLoader<PatientRiskDataLoader>()
    .AddDataLoader<CareGapDataLoader>()
    .AddInMemorySubscriptions()
    .AddFiltering()
    .AddSorting()
    .AddProjections()
    .ModifyRequestOptions(opt =>
    {
        opt.IncludeExceptionDetails = builder.Environment.IsDevelopment();
    });

// Expose REST health endpoint alongside GraphQL
builder.Services.AddHealthChecks();

var app = builder.Build();

app.MapDefaultEndpoints();
app.UseWebSockets();

// GraphQL endpoint: POST /graphql  /  GET /graphql (Banana Cake Pop IDE in dev)
app.MapGraphQL("/graphql");

// Health check
app.MapHealthChecks("/healthz");

app.Run();
