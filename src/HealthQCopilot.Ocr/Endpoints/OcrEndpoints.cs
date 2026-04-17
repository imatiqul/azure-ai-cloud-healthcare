using HealthQCopilot.Domain.Ocr;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Ocr.Infrastructure;
using HealthQCopilot.Ocr.Services;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Ocr.Endpoints;

public static class OcrEndpoints
{
    public static IEndpointRouteBuilder MapOcrEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/ocr")
            .WithTags("OCR")
            .RequireAuthorization()
            .WithAutoValidation();

        group.MapPost("/jobs", async (
            CreateOcrJobRequest request,
            OcrDbContext db,
            CancellationToken ct) =>
        {
            var job = OcrJob.Create(Guid.NewGuid(), request.DocumentUrl, request.PatientId.ToString());
            db.OcrJobs.Add(job);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/ocr/jobs/{job.Id}",
                new { job.Id, job.Status });
        });

        group.MapPost("/jobs/{id:guid}/process", async (
            Guid id,
            OcrDbContext db,
            IDocumentProcessor processor,
            CancellationToken ct) =>
        {
            var job = await db.OcrJobs.FindAsync([id], ct);
            if (job is null) return Results.NotFound();
            if (job.Status != OcrJobStatus.Queued)
                return Results.Conflict(new { Error = "Job is not in queued state" });

            job.MarkProcessing();
            await db.SaveChangesAsync(ct);

            try
            {
                var result = await processor.AnalyzeDocumentAsync(job.DocumentUrl, ct);
                var fhirDocRefId = $"DocumentReference/{Guid.NewGuid()}";
                job.Complete(result.ExtractedText, fhirDocRefId);
            }
            catch
            {
                job.Fail();
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { job.Id, job.Status, job.ExtractedText });
        });

        group.MapGet("/jobs/{id:guid}", async (
            Guid id,
            OcrDbContext db,
            CancellationToken ct) =>
        {
            var job = await db.OcrJobs.FindAsync([id], ct);
            return job is null ? Results.NotFound() : Results.Ok(job);
        });

        group.MapGet("/jobs", async (
            Guid? patientId,
            OcrDbContext db,
            CancellationToken ct) =>
        {
            var query = db.OcrJobs.AsQueryable();
            if (patientId.HasValue)
                query = query.Where(j => j.PatientId == patientId.Value.ToString());
            var jobs = await query.OrderByDescending(j => j.CreatedAt).Take(50)
                .Select(j => new { j.Id, j.PatientId, j.Status, j.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(jobs);
        });

        return app;
    }
}

public record CreateOcrJobRequest(Guid PatientId, string DocumentUrl, string DocumentType);
