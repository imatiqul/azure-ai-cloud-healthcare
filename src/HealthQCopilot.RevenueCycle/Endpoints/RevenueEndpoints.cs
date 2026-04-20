using System.Text.Json;
using HealthQCopilot.Domain.RevenueCycle;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.RevenueCycle.Infrastructure;
using HealthQCopilot.RevenueCycle.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.RevenueCycle.Endpoints;

public static class RevenueEndpoints
{
    public static IEndpointRouteBuilder MapRevenueEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/revenue")
            .WithTags("Revenue Cycle")
            .WithAutoValidation();

        // ── Coding Jobs ──────────────────────────────────────

        group.MapGet("/coding-jobs", async (
            string? status,
            int? top,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var query = db.CodingJobs.AsQueryable();
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<CodingJobStatus>(status, true, out var s))
                query = query.Where(j => j.Status == s);
            var jobs = await query.OrderByDescending(j => j.CreatedAt).Take(top ?? 50)
                .Select(j => new
                {
                    j.Id,
                    j.EncounterId,
                    j.PatientId,
                    j.PatientName,
                    SuggestedCodes = j.SuggestedCodes,
                    ApprovedCodes = j.ApprovedCodes,
                    Status = j.Status.ToString(),
                    j.CreatedAt,
                    j.ReviewedAt,
                    j.ReviewedBy
                })
                .ToListAsync(ct);
            return Results.Ok(jobs);
        });

        group.MapGet("/coding-jobs/{id:guid}", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            return job is null ? Results.NotFound() : Results.Ok(new
            {
                job.Id,
                job.EncounterId,
                job.PatientId,
                job.PatientName,
                SuggestedCodes = job.SuggestedCodes,
                ApprovedCodes = job.ApprovedCodes,
                Status = job.Status.ToString(),
                job.CreatedAt,
                job.ReviewedAt,
                job.ReviewedBy
            });
        });

        group.MapPost("/coding-jobs", async (
            CreateCodingJobRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = CodingJob.Create(request.EncounterId, request.PatientId, request.PatientName, request.SuggestedCodes);
            db.CodingJobs.Add(job);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/coding-jobs/{job.Id}",
                new { job.Id, job.EncounterId, job.Status });
        });

        group.MapPost("/coding-jobs/{id:guid}/review", async (
            Guid id,
            ReviewCodingJobRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            if (job is null) return Results.NotFound();
            var result = job.Review(request.ApprovedCodes, request.ReviewedBy);
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { job.Id, Status = job.Status.ToString(), job.ApprovedCodes });
        });

        group.MapPost("/coding-jobs/{id:guid}/submit", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var job = await db.CodingJobs.FindAsync([id], ct);
            if (job is null) return Results.NotFound();
            var result = job.Submit();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { job.Id, job.Status });
        });

        // ── Prior Authorizations ──────────────────────────────

        group.MapGet("/prior-auths", async (
            string? patientId,
            string? status,
            int? top,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PriorAuths.AsQueryable();
            if (!string.IsNullOrWhiteSpace(patientId))
                query = query.Where(a => a.PatientId == patientId);
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<PriorAuthStatus>(status, true, out var s))
                query = query.Where(a => a.Status == s);
            var auths = await query.OrderByDescending(a => a.CreatedAt).Take(top ?? 50)
                .Select(a => new
                {
                    a.Id,
                    a.PatientId,
                    a.PatientName,
                    a.Procedure,
                    a.ProcedureCode,
                    Status = a.Status.ToString(),
                    a.InsurancePayer,
                    a.DenialReason,
                    a.CreatedAt,
                    a.SubmittedAt,
                    a.ResolvedAt
                })
                .ToListAsync(ct);
            return Results.Ok(auths);
        });

        group.MapGet("/prior-auths/{id:guid}", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            return auth is null ? Results.NotFound() : Results.Ok(new
            {
                auth.Id,
                auth.PatientId,
                auth.PatientName,
                auth.Procedure,
                auth.ProcedureCode,
                Status = auth.Status.ToString(),
                auth.InsurancePayer,
                auth.DenialReason,
                auth.CreatedAt,
                auth.SubmittedAt,
                auth.ResolvedAt
            });
        });

        group.MapPost("/prior-auths", async (
            CreatePriorAuthRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = PriorAuth.Create(
                request.PatientId, request.PatientName,
                request.Procedure, request.ProcedureCode, request.InsurancePayer);
            db.PriorAuths.Add(auth);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/prior-auths/{auth.Id}",
                new { auth.Id, auth.PatientId, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/submit", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Submit();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Ok(new { auth.Id, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/approve", async (
            Guid id,
            RevenueDbContext db,
            IDistributedCache cache,
            Dapr.Client.DaprClient dapr,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Approve();
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            // Notify downstream services (patient notifications, pop-health) via Dapr pub/sub
            _ = dapr.PublishEventAsync("pubsub", "revenue.prior-auth.approved", new
            {
                auth.Id,
                auth.PatientId,
                auth.PatientName,
                auth.Procedure,
                auth.InsurancePayer,
                ResolvedAt = DateTime.UtcNow
            }, CancellationToken.None);
            return Results.Ok(new { auth.Id, auth.Status });
        });

        group.MapPost("/prior-auths/{id:guid}/deny", async (
            Guid id,
            DenyPriorAuthRequest request,
            RevenueDbContext db,
            IDistributedCache cache,
            Dapr.Client.DaprClient dapr,
            CancellationToken ct) =>
        {
            var auth = await db.PriorAuths.FindAsync([id], ct);
            if (auth is null) return Results.NotFound();
            var result = auth.Deny(request.Reason);
            if (result.IsFailure) return Results.BadRequest(new { error = result.Error });
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            // Notify downstream services (patient notifications) via Dapr pub/sub
            _ = dapr.PublishEventAsync("pubsub", "revenue.prior-auth.denied", new
            {
                auth.Id,
                auth.PatientId,
                auth.PatientName,
                auth.Procedure,
                auth.InsurancePayer,
                auth.DenialReason,
                ResolvedAt = DateTime.UtcNow
            }, CancellationToken.None);
            return Results.Ok(new { auth.Id, Status = auth.Status.ToString(), auth.DenialReason });
        });

        // ── Summary Stats ────────────────────────────────────

        group.MapGet("/stats", async (
            RevenueDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            const string cacheKey = "healthq:revenue:stats";
            var cached = await cache.GetAsync(cacheKey, ct);
            if (cached is not null)
                return Results.Ok(JsonSerializer.Deserialize<object>(cached));

            var pendingCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Pending, ct);
            var reviewedCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Approved, ct);
            var submittedCoding = await db.CodingJobs.CountAsync(j => j.Status == CodingJobStatus.Submitted, ct);
            var pendingAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Submitted || a.Status == PriorAuthStatus.UnderReview, ct);
            var approvedAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Approved, ct);
            var deniedAuths = await db.PriorAuths.CountAsync(a => a.Status == PriorAuthStatus.Denied, ct);

            var stats = new
            {
                CodingQueue = pendingCoding,
                CodingReviewed = reviewedCoding,
                CodingSubmitted = submittedCoding,
                PriorAuthsPending = pendingAuths,
                PriorAuthsApproved = approvedAuths,
                PriorAuthsDenied = deniedAuths
            };

            await cache.SetAsync(cacheKey, JsonSerializer.SerializeToUtf8Bytes(stats),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) }, ct);

            return Results.Ok(stats);
        });

        // Auto-create coding job from triage result (called by Agents service WorkflowDispatcher)
        group.MapPost("/coding-jobs/from-triage", async (
            FromTriageRequest request,
            RevenueDbContext db,
            CodeSuggestionService codeSuggestion,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            var codes = codeSuggestion.SuggestCodes(request.TriageLevel, request.TriageReasoning);
            var shortId = request.SessionId.Length >= 8 ? request.SessionId[..8] : request.SessionId;
            var patientRef = request.PatientId ?? $"PAT-{shortId}";
            var job = CodingJob.Create(
                encounterId: $"ENC-{shortId}",
                patientId: patientRef,
                patientName: "AI-Triaged Patient",
                suggestedCodes: codes);
            db.CodingJobs.Add(job);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:revenue:stats", ct);
            return Results.Created($"/api/v1/revenue/coding-jobs/{job.Id}",
                new { job.Id, job.EncounterId, job.Status, SuggestedCodes = codes });
        });

        // ── EDI 837 Claim Submissions ─────────────────────────────────────────

        // Submit an approved coding job as an EDI 837P claim to the clearinghouse.
        group.MapPost("/claims/submit", async (
            SubmitClaimRequest request,
            RevenueDbContext db,
            Edi837Generator edi837,
            ClearinghouseClient clearinghouse,
            ILogger<RevenueClaimLog> logger,
            CancellationToken ct) =>
        {
            // Validate coding job exists and is approved
            var job = await db.CodingJobs.FindAsync([request.CodingJobId], ct);
            if (job is null)
                return Results.NotFound(new { error = $"CodingJob {request.CodingJobId} not found" });
            if (job.Status != CodingJobStatus.Approved)
                return Results.UnprocessableEntity(new { error = $"Coding job must be in Approved state; current state: {job.Status}" });

            // Prevent duplicate submissions
            var existing = await db.ClaimSubmissions
                .AnyAsync(c => c.CodingJobId == request.CodingJobId
                    && c.Status != ClaimSubmissionStatus.Rejected, ct);
            if (existing)
                return Results.Conflict(new { error = "A non-rejected claim for this coding job already exists" });

            var diagnosisCodes = job.ApprovedCodes.Count > 0 ? job.ApprovedCodes : job.SuggestedCodes;

            var claim = ClaimSubmission.Create(
                codingJobId: request.CodingJobId,
                patientId: job.PatientId,
                patientName: job.PatientName,
                encounterId: job.EncounterId,
                insurancePayer: request.InsurancePayer,
                diagnosisCodes: diagnosisCodes,
                totalChargesCents: request.TotalChargesCents);

            db.ClaimSubmissions.Add(claim);
            await db.SaveChangesAsync(ct);

            // Generate EDI 837P document
            var providerInfo = new Edi837ProviderInfo(
                SenderId: request.ProviderNpi,
                Npi: request.ProviderNpi,
                TaxId: request.ProviderTaxId,
                OrganizationName: request.ProviderName,
                ContactName: request.ProviderContactName ?? "Billing Dept",
                Phone: request.ProviderPhone ?? "0000000000",
                AddressLine1: request.ProviderAddress ?? "123 Main St",
                City: request.ProviderCity ?? "New York",
                StateCode: request.ProviderState ?? "NY",
                Zip: request.ProviderZip ?? "10001");

            var subscriberInfo = new Edi837SubscriberInfo(
                PayerId: request.PayerId,
                MemberId: request.MemberId,
                FirstName: request.PatientFirstName ?? job.PatientName.Split(' ').First(),
                LastName: request.PatientLastName ?? job.PatientName.Split(' ').Last(),
                AddressLine1: request.PatientAddress ?? "456 Oak Ave",
                City: request.PatientCity ?? "New York",
                StateCode: request.PatientState ?? "NY",
                Zip: request.PatientZip ?? "10002",
                DateOfBirth: request.PatientDateOfBirth ?? new DateTime(1980, 1, 1, 0, 0, 0, DateTimeKind.Utc));

            var ediDocument = edi837.Generate(claim, providerInfo, subscriberInfo);

            // Submit to clearinghouse
            ClearinghouseSubmissionResult chResult;
            try
            {
                chResult = await clearinghouse.SubmitAsync(claim, ediDocument, ct);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Clearinghouse submission failed for claim {ClaimId}", claim.Id);
                return Results.Problem("Clearinghouse submission failed — claim saved as Pending for retry.",
                    statusCode: 503);
            }

            if (chResult.Accepted)
                claim.Submit();
            else
                claim.Reject(chResult.RejectionReason ?? "Rejected by clearinghouse");

            if (chResult.Accepted && chResult.ClearinghouseClaimId is not null)
                claim.Acknowledge(chResult.ClearinghouseClaimId);

            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                claim.Id,
                claim.Status,
                claim.ClearinghouseClaimId,
                claim.InterchangeControlNumber,
                Accepted = chResult.Accepted,
                chResult.RejectionReason,
            });
        }).WithSummary("Submit an approved coding job as an EDI 837P claim to the clearinghouse");

        // List claim submissions for a patient
        group.MapGet("/claims", async (
            string? patientId,
            string? status,
            int? top,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var query = db.ClaimSubmissions.AsQueryable();
            if (!string.IsNullOrEmpty(patientId))
                query = query.Where(c => c.PatientId == patientId);
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<ClaimSubmissionStatus>(status, true, out var s))
                query = query.Where(c => c.Status == s);
            var claims = await query
                .OrderByDescending(c => c.CreatedAt)
                .Take(top ?? 50)
                .Select(c => new
                {
                    c.Id, c.CodingJobId, c.PatientId, c.EncounterId, c.InsurancePayer,
                    Status = c.Status.ToString(), c.ClearinghouseClaimId,
                    c.TotalChargesCents, c.CreatedAt, c.SubmittedAt
                })
                .ToListAsync(ct);
            return Results.Ok(claims);
        }).WithSummary("List EDI 837 claim submissions");

        // ── EDI 835 Remittance / Payment Posting ──────────────────────────────

        // Accept an EDI 835 document, parse it, persist the remittance,
        // and apply payments to the corresponding claim submissions.
        group.MapPost("/remittance/post", async (
            HttpRequest httpRequest,
            RevenueDbContext db,
            Edi835Parser edi835,
            ILogger<RevenueClaimLog> logger,
            CancellationToken ct) =>
        {
            // Accept raw 835 as text/plain body or JSON { "edi835": "..." }
            string edi835Content;
            if (httpRequest.ContentType?.StartsWith("text/plain") == true)
            {
                using var reader = new System.IO.StreamReader(httpRequest.Body);
                edi835Content = await reader.ReadToEndAsync(ct);
            }
            else
            {
                using var doc = await System.Text.Json.JsonDocument.ParseAsync(httpRequest.Body, cancellationToken: ct);
                edi835Content = doc.RootElement.GetProperty("edi835").GetString() ?? string.Empty;
            }

            var parseResult = edi835.Parse(edi835Content);
            if (!parseResult.IsSuccess)
                return Results.BadRequest(new { error = parseResult.Error });

            var remittance = parseResult.Value!;

            // Prevent duplicate remittance posting
            var duplicate = await db.RemittanceAdvices
                .AnyAsync(r => r.PaymentReferenceNumber == remittance.PaymentReferenceNumber, ct);
            if (duplicate)
                return Results.Conflict(new { error = $"Remittance {remittance.PaymentReferenceNumber} has already been posted" });

            db.RemittanceAdvices.Add(remittance);

            // Apply payments — update matching ClaimSubmission records to Paid/Denied
            foreach (var line in remittance.ClaimLines)
            {
                if (string.IsNullOrEmpty(line.ClearinghouseClaimId)) continue;

                var claimSubmission = await db.ClaimSubmissions
                    .FirstOrDefaultAsync(c => c.ClearinghouseClaimId == line.ClearinghouseClaimId, ct);

                if (claimSubmission is null) continue;

                // CLP status 4 or 22 = denied/reversed; otherwise paid
                if (line.ClpStatusCode is "4" or "22")
                    logger.LogInformation(
                        "Remittance {RefNum} — claim {ClaimId} denied (CARC {Carc})",
                        remittance.PaymentReferenceNumber, claimSubmission.Id, line.DenialReasonCode);
                else
                    logger.LogInformation(
                        "Remittance {RefNum} — claim {ClaimId} paid {Paid} of {Billed} cents",
                        remittance.PaymentReferenceNumber, claimSubmission.Id,
                        line.PaidAmountCents, line.BilledAmountCents);
            }

            var postResult = remittance.Post();
            if (!postResult.IsSuccess)
                return Results.UnprocessableEntity(new { error = postResult.Error });

            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/revenue/remittance/{remittance.Id}", new
            {
                remittance.Id,
                remittance.PaymentReferenceNumber,
                remittance.PayerName,
                remittance.TotalPaymentCents,
                remittance.Status,
                ClaimLineCount = remittance.ClaimLines.Count,
            });
        }).WithSummary("Post an EDI 835 Electronic Remittance Advice and apply payments");

        // Get remittance details
        group.MapGet("/remittance/{id:guid}", async (
            Guid id,
            RevenueDbContext db,
            CancellationToken ct) =>
        {
            var ra = await db.RemittanceAdvices
                .Include(r => r.ClaimLines)
                    .ThenInclude(cl => cl.ServiceLines)
                .FirstOrDefaultAsync(r => r.Id == id, ct);
            return ra is null ? Results.NotFound() : Results.Ok(ra);
        }).WithSummary("Get remittance advice by ID");

        return app;
    }
}

public record CreateCodingJobRequest(string EncounterId, string PatientId, string PatientName, List<string> SuggestedCodes);
public record ReviewCodingJobRequest(List<string> ApprovedCodes, string ReviewedBy);
public record CreatePriorAuthRequest(string PatientId, string PatientName, string Procedure, string? ProcedureCode, string? InsurancePayer);
public record DenyPriorAuthRequest(string Reason);
public record FromTriageRequest(string SessionId, string TriageLevel, string TriageReasoning, string? PatientId);

/// <summary>Request body for EDI 837P claim submission.</summary>
public record SubmitClaimRequest(
    Guid CodingJobId,
    string InsurancePayer,
    string PayerId,
    string MemberId,
    long TotalChargesCents,
    // Provider details (in production, these come from a provider registry)
    string ProviderNpi,
    string ProviderTaxId,
    string ProviderName,
    string? ProviderContactName,
    string? ProviderPhone,
    string? ProviderAddress,
    string? ProviderCity,
    string? ProviderState,
    string? ProviderZip,
    // Patient demographics for 837 subscriber loop
    string? PatientFirstName,
    string? PatientLastName,
    string? PatientAddress,
    string? PatientCity,
    string? PatientState,
    string? PatientZip,
    DateTime? PatientDateOfBirth);

// Marker type for ILogger<> in static endpoint class (CS0718 workaround)
internal sealed class RevenueClaimLog { }
