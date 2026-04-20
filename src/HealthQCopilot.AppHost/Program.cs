var builder = DistributedApplication.CreateBuilder(args);

// ──────────────────────────────────────────────
// Infrastructure
// ──────────────────────────────────────────────
var postgres = builder.AddPostgres("postgres")
    .WithPgAdmin()
    .WithLifetime(ContainerLifetime.Persistent);

var voiceDb = postgres.AddDatabase("voice-db", "voice_db");
var agentDb = postgres.AddDatabase("agent-db", "agent_db");
var fhirDb = postgres.AddDatabase("fhir-db", "fhir_db");
var ocrDb = postgres.AddDatabase("ocr-db", "ocr_db");
var schedulingDb = postgres.AddDatabase("scheduling-db", "scheduling_db");
var notificationDb = postgres.AddDatabase("notification-db", "notification_db");
var pophealthDb = postgres.AddDatabase("pophealth-db", "pophealth_db");
var identityDb = postgres.AddDatabase("identity-db", "identity_db");
var revenueDb = postgres.AddDatabase("revenue-db", "revenue_db");

var redis = builder.AddRedis("redis")
    .WithLifetime(ContainerLifetime.Persistent);

var hapiFhir = builder.AddContainer("hapi-fhir", "hapiproject/hapi", "v7.2.0")
    .WithHttpEndpoint(port: 8090, targetPort: 8080)
    .WithEnvironment("hapi.fhir.default_encoding", "JSON")
    .WithEnvironment("hapi.fhir.allow_external_references", "true");

var qdrant = builder.AddContainer("qdrant", "qdrant/qdrant", "v1.9.0")
    .WithHttpEndpoint(port: 6333, targetPort: 6333, name: "http")
    .WithEndpoint(port: 6334, targetPort: 6334, name: "grpc", scheme: "http");

// ──────────────────────────────────────────────
// Microservices
// ──────────────────────────────────────────────
var identityService = builder.AddProject<Projects.HealthQCopilot_Identity>("identity-service")
    .WithReference(identityDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var voiceService = builder.AddProject<Projects.HealthQCopilot_Voice>("voice-service")
    .WithReference(voiceDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var agentService = builder.AddProject<Projects.HealthQCopilot_Agents>("agent-service")
    .WithReference(agentDb)
    .WithReference(redis)
    .WithEnvironment("Qdrant__Endpoint", qdrant.GetEndpoint("http"))
    .WithExternalHttpEndpoints();

var fhirService = builder.AddProject<Projects.HealthQCopilot_Fhir>("fhir-service")
    .WithReference(fhirDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var ocrService = builder.AddProject<Projects.HealthQCopilot_Ocr>("ocr-service")
    .WithReference(ocrDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var schedulingService = builder.AddProject<Projects.HealthQCopilot_Scheduling>("scheduling-service")
    .WithReference(schedulingDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var notificationService = builder.AddProject<Projects.HealthQCopilot_Notifications>("notification-service")
    .WithReference(notificationDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var pophealthService = builder.AddProject<Projects.HealthQCopilot_PopulationHealth>("pophealth-service")
    .WithReference(pophealthDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

var revenueService = builder.AddProject<Projects.HealthQCopilot_RevenueCycle>("revenue-service")
    .WithReference(revenueDb)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

// ──────────────────────────────────────────────
// API Gateway (YARP reverse proxy)
// ──────────────────────────────────────────────
var gateway = builder.AddProject<Projects.HealthQCopilot_Gateway>("api-gateway")
    .WithReference(identityService)
    .WithReference(voiceService)
    .WithReference(agentService)
    .WithReference(fhirService)
    .WithReference(ocrService)
    .WithReference(schedulingService)
    .WithReference(notificationService)
    .WithReference(pophealthService)
    .WithReference(revenueService)
    .WithHttpEndpoint(port: 5000, name: "gateway")
    .WithExternalHttpEndpoints();

// ──────────────────────────────────────────────
// Frontend (Vite apps via pnpm)
// ──────────────────────────────────────────────
var frontend = builder.AddNpmApp("frontend-shell", "../../frontend", "dev")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithReference(gateway);

builder.Build().Run();
