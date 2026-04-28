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
// BFF — GraphQL aggregation layer
// ──────────────────────────────────────────────
var bff = builder.AddProject<Projects.HealthQCopilot_BFF>("bff")
    .WithReference(pophealthService)
    .WithReference(agentService)
    .WithReference(revenueService)
    .WithReference(schedulingService)
    .WithReference(fhirService)
    .WithReference(redis)
    .WithExternalHttpEndpoints();

// ──────────────────────────────────────────────
// Gateway — YARP reverse proxy
// ──────────────────────────────────────────────
builder.AddProject<Projects.HealthQCopilot_Gateway>("gateway")
    .WithReference(identityService)
    .WithReference(voiceService)
    .WithReference(agentService)
    .WithReference(fhirService)
    .WithReference(ocrService)
    .WithReference(schedulingService)
    .WithReference(notificationService)
    .WithReference(pophealthService)
    .WithReference(revenueService)
    .WithReference(bff)
    .WithExternalHttpEndpoints();

// ──────────────────────────────────────────────
// Azure Service Bus Emulator (local dev)
// ──────────────────────────────────────────────
var sqlServiceBus = builder.AddContainer("sql-servicebus", "mcr.microsoft.com/mssql/server", "2022-latest")
    .WithEnvironment("ACCEPT_EULA", "Y")
    .WithEnvironment("SA_PASSWORD", "ServiceBus!Dev123")
    .WithEndpoint(port: 1433, targetPort: 1433);

builder.AddContainer("servicebus-emulator", "mcr.microsoft.com/azure-messaging/servicebus-emulator", "latest")
    .WithEnvironment("ACCEPT_EULA", "Y")
    .WithEndpoint(port: 5672, targetPort: 5672, name: "amqp")
    .WithEndpoint(port: 5300, targetPort: 5300, name: "mgmt")
    .WaitFor(sqlServiceBus);

// ──────────────────────────────────────────────
// Dapr placement service
// ──────────────────────────────────────────────
builder.AddContainer("dapr-placement", "daprio/dapr", "1.14")
    .WithArgs("./placement", "--port", "50006")
    .WithEndpoint(port: 50006, targetPort: 50006);

// ──────────────────────────────────────────────
// Frontend MFEs (Vite dev servers)
// ──────────────────────────────────────────────
builder.AddNpmApp("shell", "../../frontend/apps/shell")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("voice-mfe", "../../frontend/apps/voice-mfe")
    .WithHttpEndpoint(port: 3001, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("triage-mfe", "../../frontend/apps/triage-mfe")
    .WithHttpEndpoint(port: 3002, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("scheduling-mfe", "../../frontend/apps/scheduling-mfe")
    .WithHttpEndpoint(port: 3003, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("pophealth-mfe", "../../frontend/apps/pophealth-mfe")
    .WithHttpEndpoint(port: 3004, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("revenue-mfe", "../../frontend/apps/revenue-mfe")
    .WithHttpEndpoint(port: 3005, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("encounters-mfe", "../../frontend/apps/encounters-mfe")
    .WithHttpEndpoint(port: 3006, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("engagement-mfe", "../../frontend/apps/engagement-mfe")
    .WithHttpEndpoint(port: 3007, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
