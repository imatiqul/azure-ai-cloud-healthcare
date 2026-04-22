using FluentValidation;
using HealthQCopilot.Domain.Voice;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.RealTime;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
using HealthQCopilot.Voice.Endpoints;
using HealthQCopilot.Voice.Hubs;
using HealthQCopilot.Voice.Infrastructure;
using HealthQCopilot.Voice.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "voice-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<VoiceDbContext>(
    builder.Configuration, "VoiceDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<VoiceDbContext>(builder.Configuration);
builder.Services.AddSingleton<ITranscriptionService, AzureSpeechTranscriptionService>();
builder.Services.AddDaprClient();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<VoiceDbContext>("voice");

// Azure Web PubSub replaces SignalR for real-time server→client push
builder.Services.AddWebPubSubService();

// Azure Event Hubs for HIPAA-compliant immutable audit stream
builder.Services.AddEventHubAudit();

builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "VoiceDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddHostedService<StartupValidationService>();

var app = builder.Build();

await app.InitializeDatabaseAsync<VoiceDbContext>();
await app.InitializeDatabaseAsync<AuditDbContext>();

app.MapOpenApi();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<PhiAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseHealthcareRateLimiting();
app.MapControllers();
app.MapDefaultEndpoints();
app.MapVoiceWebPubSubNegotiate();
app.MapVoiceEndpoints();

// ── Demo seed endpoint (idempotent) ──────────────────────────────────────────
app.MapPost("/api/v1/voice/seed", async (VoiceDbContext db) =>
{
    if (await db.VoiceSessions.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    var s1 = VoiceSession.Start("PAT-001");
    s1.AppendTranscript("Patient reported chest tightness and shortness of breath on exertion for 3 days. BP 158/94, HR 92, O2Sat 96%. Provider ordered troponin and ECG. Referral placed to cardiology.");
    s1.End();

    var s2 = VoiceSession.Start("PAT-002");
    s2.AppendTranscript("COPD exacerbation — patient presents with increased dyspnoea and productive cough. SpO2 88% on room air. Started on prednisolone 40mg and azithromycin. Oxygen supplementation initiated.");
    s2.End();

    var s3 = VoiceSession.Start("PAT-003");
    s3.AppendTranscript("Routine medication refill — lisinopril 10 mg daily. BP 132/82, well controlled. Patient adhering to low-sodium diet. Labs ordered: BMP in 6 weeks. Follow-up in 3 months.");
    s3.End();

    db.VoiceSessions.AddRange(s1, s2, s3);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", sessions = 3 });
})
.WithTags("Seed")
.WithSummary("Seed demo voice sessions (idempotent)");

app.Run();

public partial class Program { }

