using Azure.Communication.Sms;
using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;

namespace HealthQCopilot.Identity.Endpoints;

public static class IdentityEndpoints
{
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/identity")
            .WithTags("Identity")
            .WithAutoValidation();

        group.MapPost("/users", async (
            CreateUserRequest request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = UserAccount.Create(Guid.NewGuid(), request.ExternalId, request.Email, request.FullName, request.Role);
            db.UserAccounts.Add(user);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/identity/users/{user.Id}",
                new { user.Id, user.Email, user.Role });
        });

        group.MapGet("/users/{id:guid}", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            return user is null ? Results.NotFound() : Results.Ok(new
            {
                user.Id,
                user.ExternalId,
                user.Email,
                user.DisplayName,
                user.Role,
                user.IsActive,
                user.LastLoginAt
            });
        });

        group.MapGet("/users/by-external/{externalId}", async (
            string externalId,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == externalId, ct);
            return user is null ? Results.NotFound() : Results.Ok(new
            {
                user.Id,
                user.ExternalId,
                user.Email,
                user.DisplayName,
                user.Role,
                user.IsActive
            });
        });

        group.MapPost("/users/{id:guid}/login", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.RecordLogin();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.LastLoginAt });
        });

        group.MapPost("/users/{id:guid}/deactivate", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.Deactivate();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.IsActive });
        });

        group.MapGet("/users", async (
            string? role,
            bool? active,
            int page,
            int pageSize,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var query = db.UserAccounts.AsQueryable();
            if (!string.IsNullOrEmpty(role) && Enum.TryParse<UserRole>(role, true, out var roleEnum))
                query = query.Where(u => u.Role == roleEnum);
            if (active.HasValue)
                query = query.Where(u => u.IsActive == active.Value);
            var total = await query.CountAsync(ct);
            var users = await query.OrderBy(u => u.DisplayName)
                .Skip(Math.Max(0, page - 1) * Math.Clamp(pageSize, 1, 100))
                .Take(Math.Clamp(pageSize, 1, 100))
                .Select(u => new { u.Id, u.ExternalId, u.Email, u.DisplayName, Role = u.Role.ToString(), u.IsActive, u.LastLoginAt })
                .ToListAsync(ct);
            return Results.Ok(new { total, page, pageSize, users });
        });

        group.MapPut("/users/{id:guid}", async (
            Guid id,
            UpdateUserRequest request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.UpdateProfile(request.Email, request.FullName);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.Email, user.DisplayName });
        });

        // GET /me — resolve current user from bearer token subject claim
        group.MapGet("/me", async (
            HttpContext http,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var externalId = http.User.FindFirst("sub")?.Value
                ?? http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(externalId))
                return Results.Unauthorized();
            var user = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == externalId, ct);
            return user is null
                ? Results.NotFound()
                : Results.Ok(new
                {
                    user.Id,
                    user.ExternalId,
                    user.Email,
                    user.DisplayName,
                    Role = user.Role.ToString(),
                    user.IsActive,
                    user.LastLoginAt
                });
        }).RequireAuthorization();

        // ── Patient Self-Registration ───────────────────────────────────────────
        // Public endpoint: registers a patient account from their Entra ID token.
        // The caller supplies their external (Entra ID object) id + profile details.
        // No admin token required — patient registers themselves after B2C sign-up.
        group.MapPost("/patients/register", async (
            RegisterPatientRequest request,
            IdentityDbContext db,
            IHttpClientFactory httpClientFactory,
            ILogger<PatientRegistrationLog> logger,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.ExternalId))
                return Results.BadRequest(new { error = "ExternalId is required" });
            if (string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest(new { error = "Email is required" });

            // Idempotent: return existing record if already registered
            var existing = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == request.ExternalId, ct);

            if (existing is not null)
                return Results.Ok(new { existing.Id, existing.Email, Role = existing.Role.ToString(), existing.FhirPatientId, alreadyRegistered = true });

            var patient = UserAccount.Create(
                Guid.NewGuid(),
                request.ExternalId,
                request.Email,
                request.FullName,
                UserRole.Patient);

            db.UserAccounts.Add(patient);
            await db.SaveChangesAsync(ct);

            // Create a corresponding FHIR Patient resource so clinical data can be linked.
            try
            {
                var fhirPatient = new
                {
                    resourceType = "Patient",
                    identifier = new[]
                    {
                        new { system = "https://healthq.example/identity", value = patient.Id.ToString() }
                    },
                    name = new[]
                    {
                        new { use = "official", text = request.FullName }
                    },
                    telecom = new[]
                    {
                        new { system = "email", value = request.Email, use = "home" }
                    }
                };

                var fhirClient = httpClientFactory.CreateClient("FhirService");
                var json = JsonSerializer.Serialize(fhirPatient);
                var response = await fhirClient.PostAsync(
                    "api/v1/fhir/patients",
                    new StringContent(json, Encoding.UTF8, "application/fhir+json"),
                    ct);

                if (response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("id", out var idEl))
                    {
                        patient.SetFhirPatientId(idEl.GetString()!);
                        await db.SaveChangesAsync(ct);
                    }
                }
                else
                {
                    logger.LogError(
                        "FHIR Patient create failed for identity {PatientId} — status {Status}",
                        patient.Id, (int)response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "FHIR Patient create threw for identity {PatientId}", patient.Id);
                // Registration still succeeds; FhirPatientId will be null until backfilled.
            }

            return Results.Created($"/api/v1/identity/users/{patient.Id}",
                new { patient.Id, patient.Email, Role = patient.Role.ToString(), patient.FhirPatientId });
        }).WithSummary("Self-register a patient account after B2C sign-up");

        // Patient-facing profile — returns the calling patient's own record.
        group.MapGet("/patients/me", async (
            HttpContext http,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var externalId = http.User.FindFirst("sub")?.Value
                ?? http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(externalId))
                return Results.Unauthorized();

            var user = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == externalId && u.Role == UserRole.Patient, ct);

            return user is null
                ? Results.NotFound(new { error = "Patient profile not found. Please complete registration." })
                : Results.Ok(new
                {
                    user.Id,
                    user.ExternalId,
                    user.Email,
                    user.DisplayName,
                    user.IsActive,
                    user.FhirPatientId
                });
        }).RequireAuthorization("Patient").WithSummary("Get the authenticated patient's own profile");

        // ── OTP: send ─────────────────────────────────────────────────────────
        // Generates a 6-digit code and sends it via ACS SMS.
        // Rate limiting is enforced upstream by AddHealthcareRateLimiting().
        group.MapPost("/otp/send", async (
            OtpSendRequest request,
            IdentityDbContext db,
            IConfiguration config,
            ILogger<OtpLog> logger,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PhoneNumber))
                return Results.BadRequest(new { error = "PhoneNumber is required in E.164 format, e.g. +12125551234" });

            var (record, plainCode) = OtpRecord.Create(request.PhoneNumber, request.UserId);
            db.OtpRecords.Add(record);
            await db.SaveChangesAsync(ct);

            var connectionString = config["AzureCommunication:ConnectionString"];
            var senderPhone = config["AzureCommunication:SenderPhone"] ?? "+18005551234";

            if (string.IsNullOrEmpty(connectionString))
            {
                // Dev/test mode: log the code instead of sending (never in production)
                logger.LogWarning(
                    "ACS not configured — OTP for {Phone}: {Code} (dev mode only)",
                    request.PhoneNumber, plainCode);
            }
            else
            {
                try
                {
                    var smsClient = new SmsClient(connectionString);
                    await smsClient.SendAsync(
                        senderPhone,
                        request.PhoneNumber,
                        $"Your HealthQ Copilot verification code is: {plainCode}. Valid for 10 minutes. Do not share this code.",
                        cancellationToken: ct);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to send OTP SMS to {Phone}", request.PhoneNumber);
                    return Results.Problem("SMS delivery failed. Please try again.", statusCode: 503);
                }
            }

            return Results.Ok(new { otpId = record.Id, expiresAt = record.ExpiresAt });
        }).WithSummary("Send a one-time SMS verification code to a phone number");

        // ── OTP: verify ───────────────────────────────────────────────────────
        // Checks the submitted code against the stored hash.
        // On success marks the OTP as used and (optionally) updates the user's
        // phone verification status.
        group.MapPost("/otp/verify", async (
            OtpVerifyRequest request,
            IdentityDbContext db,
            ILogger<OtpLog> logger,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Code) || request.OtpId == Guid.Empty)
                return Results.BadRequest(new { error = "OtpId and Code are required" });

            var record = await db.OtpRecords.FindAsync([request.OtpId], ct);

            if (record is null || !record.Verify(request.Code))
            {
                logger.LogWarning("OTP verification failed for id {OtpId}", request.OtpId);
                return Results.UnprocessableEntity(new { error = "Invalid or expired code" });
            }

            record.MarkUsed();
            await db.SaveChangesAsync(ct);

            logger.LogInformation("OTP verified successfully for phone {Phone}", record.PhoneNumber);
            return Results.Ok(new { verified = true, phoneNumber = record.PhoneNumber });
        }).WithSummary("Verify a one-time SMS code");

        return app;
    }
}

public record CreateUserRequest(string ExternalId, string Email, string FullName, UserRole Role);
public record UpdateUserRequest(string Email, string FullName);
public record RegisterPatientRequest(string ExternalId, string Email, string FullName);
public record OtpSendRequest(string PhoneNumber, Guid? UserId);
public record OtpVerifyRequest(Guid OtpId, string Code);

// Marker types for ILogger<> in static classes (CS0718 workaround)
internal sealed class PatientRegistrationLog { }
internal sealed class OtpLog { }
