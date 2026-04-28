using Azure.Communication.Sms;
using FluentValidation;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.BackgroundServices;
using HealthQCopilot.Identity.Endpoints;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;
using HealthQCopilot.Infrastructure.Persistence;
using HealthQCopilot.Infrastructure.Resilience;
using HealthQCopilot.Infrastructure.Security;
using HealthQCopilot.Infrastructure.Startup;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "identity-service");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();
builder.Services.AddControllers().AddDapr();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddHealthcareDb<IdentityDbContext>(
    builder.Configuration, "IdentityDb",
    new HealthQCopilot.Infrastructure.Persistence.AuditInterceptor(),
    new HealthQCopilot.Infrastructure.Persistence.SoftDeleteInterceptor());
builder.Services.AddOutboxRelay<IdentityDbContext>(builder.Configuration);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddDomainEvents<IdentityDbContext>();
builder.Services.AddHealthChecks();
builder.Services.AddDatabaseHealthCheck<IdentityDbContext>("identity");
builder.Services.AddHealthcareDb<AuditDbContext>(builder.Configuration, "IdentityDb");
builder.Services.AddDaprSecretProvider();
builder.Services.AddDaprClient();
builder.Services.AddEventHubAudit();
builder.Services.AddHostedService<BreakGlassExpiryService>();
builder.Services.AddHostedService<StartupValidationService>();
builder.Services.AddHttpClient("FhirService", client =>
{
    var apiBase = builder.Configuration["Services:ApiBase"] ?? "http://localhost:5050";
    client.BaseAddress = new Uri(apiBase.TrimEnd('/') + "/");
    client.DefaultRequestHeaders.Add("Accept", "application/fhir+json");
}).AddServiceResilienceHandler();

// ACS SMS client — used by the OTP endpoints for phone verification
var acsConnectionString = builder.Configuration["AzureCommunication:ConnectionString"];
if (!string.IsNullOrEmpty(acsConnectionString))
{
    builder.Services.AddSingleton(new SmsClient(acsConnectionString));
}

var app = builder.Build();

await app.InitializeDatabaseAsync<IdentityDbContext>();
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
app.MapIdentityEndpoints();
app.MapConsentEndpoints();
app.MapBreakGlassEndpoints();
app.MapTenantOnboardingEndpoints();
app.MapAuditExportEndpoints();

// ── Demo seed endpoint — guarded: requires Admin role, disabled in production ──
app.MapPost("/api/v1/identity/seed", async (IdentityDbContext db, IWebHostEnvironment env) =>
{
    if (env.IsProduction())
        return Results.NotFound(); // Hide the endpoint entirely in prod

    if (await db.UserAccounts.AnyAsync()) return Results.Ok(new { message = "Already seeded" });

    // ── Clinician accounts (known IDs so break-glass FK references work) ──────
    var users = new[]
    {
        // Existing clinicians
        UserAccount.Create(Guid.Parse("00000000-0001-0000-0000-000000000001"), "dr-parker-ext",     "e.parker@healthq.demo",     "Dr. E. Parker",        UserRole.Practitioner),
        UserAccount.Create(Guid.Parse("00000000-0002-0000-0000-000000000002"), "dr-chandra-ext",    "m.chandra@healthq.demo",    "Dr. M. Chandra",       UserRole.Practitioner),
        UserAccount.Create(Guid.Parse("00000000-0003-0000-0000-000000000003"), "nurse-williams-ext","t.williams@healthq.demo",   "Nurse T. Williams",    UserRole.Practitioner),
        UserAccount.Create(Guid.Parse("00000000-0004-0000-0000-000000000004"), "admin-wilson-ext",  "m.wilson@healthq.demo",     "Mark Wilson",          UserRole.Admin),
        UserAccount.Create(Guid.Parse("00000000-0005-0000-0000-000000000005"), "dr-smith-ext",      "r.smith@healthq.demo",      "Dr. Robert Smith",     UserRole.Practitioner),
        // New specialist clinicians
        UserAccount.Create(Guid.Parse("00000000-0006-0000-0000-000000000006"), "dr-kim-ext",        "r.kim@healthq.demo",        "Dr. Rachel Kim",       UserRole.Practitioner), // Pediatric Pulmonology
        UserAccount.Create(Guid.Parse("00000000-0007-0000-0000-000000000007"), "dr-tanaka-ext",     "k.tanaka@healthq.demo",     "Dr. Kenji Tanaka",     UserRole.Practitioner), // Psychiatry
        UserAccount.Create(Guid.Parse("00000000-0008-0000-0000-000000000008"), "dr-rivera-ext",     "s.rivera@healthq.demo",     "Dr. Sofia Rivera",     UserRole.Practitioner), // Rheumatology
        UserAccount.Create(Guid.Parse("00000000-0009-0000-0000-000000000009"), "dr-osei-ext",       "d.osei@healthq.demo",       "Dr. Daniel Osei",      UserRole.Practitioner), // Oncology
        UserAccount.Create(Guid.Parse("00000000-0010-0000-0000-000000000010"), "dr-awilliams-ext",  "a.williams@healthq.demo",   "Dr. Amara Williams",   UserRole.Practitioner), // Neurology
        UserAccount.Create(Guid.Parse("00000000-0011-0000-0000-000000000011"), "dr-bosworth-ext",   "h.bosworth@healthq.demo",   "Dr. Helen Bosworth",   UserRole.Practitioner), // Geriatrics
    };
    db.UserAccounts.AddRange(users);

    // ── Patient accounts (for consent FK references) ───────────────────────────
    var patients = new[]
    {
        // Existing patients
        UserAccount.Create(Guid.Parse("00000000-0011-0000-0000-000000000011"), "pat-001-ext", "s.mitchell@patient.demo",   "Sarah Mitchell",    UserRole.Patient),
        UserAccount.Create(Guid.Parse("00000000-0012-0000-0000-000000000012"), "pat-002-ext", "d.okafor@patient.demo",     "David Okafor",      UserRole.Patient),
        UserAccount.Create(Guid.Parse("00000000-0013-0000-0000-000000000013"), "pat-003-ext", "m.gonzalez@patient.demo",   "Maria Gonzalez",    UserRole.Patient),
        // New patients (paediatric & young adult)
        UserAccount.Create(Guid.Parse("00000000-0014-0000-0000-000000000014"), "pat-009-ext", "n.patel@patient.demo",      "Noah Patel",        UserRole.Patient), // age 11, Asthma
        UserAccount.Create(Guid.Parse("00000000-0015-0000-0000-000000000015"), "pat-010-ext", "a.johnson@patient.demo",    "Aisha Johnson",     UserRole.Patient), // age 16, T1DM+ADHD
        UserAccount.Create(Guid.Parse("00000000-0016-0000-0000-000000000016"), "pat-011-ext", "t.reeves@patient.demo",     "Tyler Reeves",      UserRole.Patient), // age 22, Depression+SUD
        UserAccount.Create(Guid.Parse("00000000-0017-0000-0000-000000000017"), "pat-012-ext", "p.sharma@patient.demo",     "Priya Sharma",      UserRole.Patient), // age 27, SLE+Nephritis
        UserAccount.Create(Guid.Parse("00000000-0018-0000-0000-000000000018"), "pat-013-ext", "c.mendez@patient.demo",     "Carlos Mendez",     UserRole.Patient), // age 45, Colorectal Ca
    };
    db.UserAccounts.AddRange(patients);

    // ── Break-glass access records — two active, one revoked ─────────────────
    var bg1 = BreakGlassAccess.Create(
        users[0].Id, "PAT-00891",
        "Emergency — unresponsive patient, identity unknown. Activation time-critical.",
        TimeSpan.FromHours(4));
    var bg2 = BreakGlassAccess.Create(
        users[1].Id, "PAT-001",
        "Code blue override — cardiac arrest response in bay 3.",
        TimeSpan.FromHours(4));
    var bg3 = BreakGlassAccess.Create(
        users[2].Id, "PAT-006",
        "Unconscious trauma patient — MRN lookup required for surgical consent.",
        TimeSpan.FromHours(1));
    bg3.Revoke(users[3].Id, "Access window closed after patient ID confirmed via wristband.");
    db.BreakGlassAccesses.AddRange(bg1, bg2, bg3);

    // ── Consent records ────────────────────────────────────────────────────────
    var consents = new[]
    {
        ConsentRecord.Grant(patients[0].Id, "research",    "phi-share-research", "v2.1", DateTime.UtcNow.AddDays(245)),
        ConsentRecord.Grant(patients[1].Id, "data-sharing","phi-share-payer",    "v2.1", DateTime.UtcNow.AddDays(275)),
        ConsentRecord.Grant(patients[2].Id, "telemedicine","phi-read",           "v2.1", DateTime.UtcNow.AddDays(305)),
    };
    db.ConsentRecords.AddRange(consents);

    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Seeded", users = users.Length + patients.Length, breakGlass = 3, consents = consents.Length });
})
.WithTags("Seed")
.WithSummary("Seed demo identity data (idempotent)")
.RequireAuthorization("Admin");

app.Run();

public partial class Program { }
