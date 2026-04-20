using System.Text.Json;
using HealthQCopilot.Domain.PopulationHealth;
using HealthQCopilot.PopulationHealth.Infrastructure;
using HealthQCopilot.PopulationHealth.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace HealthQCopilot.PopulationHealth.Endpoints;

public static class PopHealthEndpoints
{
    public static IEndpointRouteBuilder MapPopHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/population-health")
            .WithTags("Population Health");

        group.MapGet("/risks", async (
            string? riskLevel,
            int? top,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PatientRisks.AsQueryable();
            if (!string.IsNullOrEmpty(riskLevel) && Enum.TryParse<RiskLevel>(riskLevel, true, out var level))
                query = query.Where(r => r.Level == level);
            var risks = await query
                .OrderByDescending(r => r.RiskScore)
                .Take(top ?? 50)
                .Select(r => new { r.Id, r.PatientId, Level = r.Level.ToString(), r.RiskScore, r.AssessedAt })
                .ToListAsync(ct);
            return Results.Ok(risks);
        });

        group.MapGet("/risks/{patientId:guid}", async (
            Guid patientId,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var risk = await db.PatientRisks
                .Where(r => r.PatientId == patientId.ToString())
                .OrderByDescending(r => r.AssessedAt)
                .FirstOrDefaultAsync(ct);
            return risk is null ? Results.NotFound() : Results.Ok(risk);
        });

        group.MapGet("/care-gaps", async (
            string? status,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var query = db.CareGaps.AsQueryable();
            if (!string.IsNullOrEmpty(status) && Enum.TryParse<CareGapStatus>(status, true, out var s))
                query = query.Where(g => g.Status == s);
            var gaps = await query
                .OrderByDescending(g => g.IdentifiedAt)
                .Take(100)
                .Select(g => new { g.Id, g.PatientId, MeasureName = g.MeasureId, Status = g.Status.ToString(), g.IdentifiedAt })
                .ToListAsync(ct);
            return Results.Ok(gaps);
        });

        group.MapPost("/care-gaps/{id:guid}/address", async (
            Guid id,
            PopHealthDbContext db,
            IDistributedCache cache,
            CareGapNotificationDispatcher notificationDispatcher,
            CancellationToken ct) =>
        {
            var gap = await db.CareGaps.FindAsync([id], ct);
            if (gap is null) return Results.NotFound();
            gap.Address();
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:pophealth:stats", ct);
            // Fire-and-forget: create follow-up notification campaign for this patient
            _ = Task.Run(() => notificationDispatcher.DispatchCareGapAddressedAsync(gap, CancellationToken.None));
            return Results.Ok(new { gap.Id, Status = gap.Status.ToString() });
        });

        group.MapGet("/stats", async (
            PopHealthDbContext db,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            const string cacheKey = "healthq:pophealth:stats";
            var cached = await cache.GetAsync(cacheKey, ct);
            if (cached is not null)
                return Results.Ok(JsonSerializer.Deserialize<object>(cached));

            var highRisk = await db.PatientRisks.CountAsync(r => r.Level == RiskLevel.Critical || r.Level == RiskLevel.High, ct);
            var totalPatients = await db.PatientRisks.CountAsync(ct);
            var openGaps = await db.CareGaps.CountAsync(g => g.Status == CareGapStatus.Open, ct);
            var closedGaps = await db.CareGaps.CountAsync(g => g.Status == CareGapStatus.Addressed, ct);
            var stats = new { HighRiskPatients = highRisk, TotalPatients = totalPatients, OpenCareGaps = openGaps, ClosedCareGaps = closedGaps };

            await cache.SetAsync(cacheKey, JsonSerializer.SerializeToUtf8Bytes(stats),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) }, ct);

            return Results.Ok(stats);
        });

        group.MapPost("/risks/calculate", async (
            CalculateRiskRequest request,
            PopHealthDbContext db,
            RiskCalculationService calculator,
            IDistributedCache cache,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId))
                return Results.BadRequest(new { error = "PatientId is required" });

            var existing = await db.PatientRisks
                .Where(r => r.PatientId == request.PatientId)
                .OrderByDescending(r => r.AssessedAt)
                .FirstOrDefaultAsync(ct);

            PatientRisk risk;
            if (existing is not null)
                risk = calculator.Recalculate(request.PatientId, existing.RiskFactors, request.Conditions, request.TriageLevel);
            else
                risk = calculator.Calculate(request.PatientId, request.Conditions, request.TriageLevel);

            db.PatientRisks.Add(risk);
            await db.SaveChangesAsync(ct);
            await cache.RemoveAsync("healthq:pophealth:stats", ct);

            return Results.Created($"/api/v1/population-health/risks/{request.PatientId}",
                new { risk.Id, risk.PatientId, Level = risk.Level.ToString(), risk.RiskScore, risk.AssessedAt });
        }).WithSummary("Calculate and persist a fresh risk score for a patient");

        group.MapGet("/patients/{patientId}/hedis", (
            string patientId,
            [Microsoft.AspNetCore.Mvc.FromBody] HedisMeasureInput body,
            HedisMeasureCalculator hedis) =>
        {
            var input = new HedisMeasureCalculator.PatientMeasureInput
            {
                PatientId               = patientId,
                Age                     = body.Age,
                Sex                     = body.Sex,
                Conditions              = body.Conditions,
                Procedures              = body.Procedures,
                Observations            = body.Observations,
                LastHbA1cDate           = body.LastHbA1cDate,
                LastHbA1cValue          = body.LastHbA1cValue,
                LastBpDate              = body.LastBpDate,
                LastSystolicBp          = body.LastSystolicBp,
                LastDiastolicBp         = body.LastDiastolicBp,
                LastMammogramDate       = body.LastMammogramDate,
                LastColorectalScreenDate = body.LastColorectalScreenDate,
                ColorectalScreenType    = body.ColorectalScreenType,
            };

            var results = hedis.EvaluateAll(input);
            var careGaps = results.Where(r => r.HasCareGap).ToList();

            return Results.Ok(new
            {
                PatientId     = patientId,
                MeasureResults = results,
                TotalMeasures  = results.Count(r => r.InDenominator),
                CareGapCount   = careGaps.Count,
                CompliantCount = results.Count(r => r.InDenominator && r.InNumerator),
            });
        })
        .WithSummary("Evaluate HEDIS quality measures and identify care gaps for a patient")
        .WithDescription("Evaluates CDC-HbA1c, CBP, BCS, COL measures. Returns care gap details and recommended actions.");

        // ── Drug Interaction Check ────────────────────────────────────────────

        group.MapPost("/drug-interactions/check", (
            DrugInteractionCheckInput input,
            DrugInteractionService ddi) =>
        {
            if (input.Drugs is null || input.Drugs.Count < 2)
                return Results.BadRequest(new { error = "At least 2 drug names are required" });

            var result = ddi.Check(input.Drugs);

            return Results.Ok(new
            {
                result.Drugs,
                result.AlertLevel,
                result.HasContraindication,
                result.HasMajorInteraction,
                InteractionCount = result.Interactions.Count,
                result.Interactions,
            });
        })
        .WithSummary("Check a medication list for known drug–drug interactions")
        .WithDescription(
            "Rule-based DDI checker covering contraindicated, major, and moderate interactions. " +
            "Supports generic and brand drug names (case-insensitive substring match). " +
            "In production, augment with NLM RxNav /REST/interaction/list.json for comprehensive " +
            "RxNorm-based DDI lookup and CDS Hooks order-sign integration.");

        // ── SDOH Assessment ───────────────────────────────────────────────────
        group.MapPost("/sdoh", async (
            SdohAssessmentRequest request,
            PopHealthDbContext db,
            SdohScoringService sdoh,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId))
                return Results.BadRequest(new { error = "PatientId is required" });

            var assessment = sdoh.Score(request);
            db.SdohAssessments.Add(assessment);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/population-health/sdoh/{request.PatientId}",
                new
                {
                    assessment.Id,
                    assessment.PatientId,
                    assessment.TotalScore,
                    assessment.RiskLevel,
                    assessment.CompositeRiskWeight,
                    DomainScores       = assessment.DomainScores,
                    PrioritizedNeeds   = assessment.PrioritizedNeeds,
                    RecommendedActions = assessment.RecommendedActions,
                    assessment.AssessedAt,
                });
        })
        .WithSummary("Submit an SDOH screening assessment for a patient")
        .WithDescription(
            "Scores 8 SDOH domains (0–3 each, total 0–24). " +
            "Returns risk level (Low/Moderate/High), composite risk weight for blending into " +
            "clinical risk scores, prioritised needs, and recommended social interventions. " +
            "Aligns with PRAPARE and FHIR Gravity Project SDOH Clinical Care terminology.");

        group.MapGet("/sdoh/{patientId}", async (
            string patientId,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var latest = await db.SdohAssessments
                .Where(a => a.PatientId == patientId)
                .OrderByDescending(a => a.AssessedAt)
                .FirstOrDefaultAsync(ct);

            if (latest is null) return Results.NotFound();

            return Results.Ok(new
            {
                latest.Id,
                latest.PatientId,
                latest.TotalScore,
                latest.RiskLevel,
                latest.CompositeRiskWeight,
                DomainScores       = latest.DomainScores,
                PrioritizedNeeds   = latest.PrioritizedNeeds,
                RecommendedActions = latest.RecommendedActions,
                latest.AssessedBy,
                latest.AssessedAt,
            });
        })
        .WithSummary("Get the latest SDOH assessment for a patient");

        // ── Cost Prediction ───────────────────────────────────────────────────

        group.MapPost("/cost-prediction", async (
            CostPredictionInput input,
            PopHealthDbContext db,
            CostPredictionService costService,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.PatientId))
                return Results.BadRequest(new { error = "PatientId is required" });

            // Resolve SDOH weight from latest assessment if not supplied
            double sdohWeight = input.SdohWeight;
            if (sdohWeight <= 0)
            {
                var latestSdoh = await db.SdohAssessments
                    .Where(a => a.PatientId == input.PatientId)
                    .OrderByDescending(a => a.AssessedAt)
                    .Select(a => a.CompositeRiskWeight)
                    .FirstOrDefaultAsync(ct);
                sdohWeight = latestSdoh;
            }

            var request = new CostPredictionRequest(
                PatientId:  input.PatientId,
                RiskLevel:  input.RiskLevel,
                Conditions: input.Conditions,
                SdohWeight: sdohWeight);

            var prediction = costService.Predict(request);
            db.CostPredictions.Add(prediction);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/population-health/cost-prediction/{input.PatientId}",
                new
                {
                    prediction.Id,
                    prediction.PatientId,
                    Predicted12mCostUsd = prediction.Predicted12mCost,
                    LowerBound95Usd     = prediction.LowerBound95,
                    UpperBound95Usd     = prediction.UpperBound95,
                    prediction.CostTier,
                    CostDrivers         = prediction.CostDrivers,
                    prediction.ModelVersion,
                    prediction.PredictedAt,
                });
        })
        .WithSummary("Predict 12-month total cost of care for a patient")
        .WithDescription(
            "Rule-based actuarial model (AHRQ MEPS 2022 calibrated). " +
            "Returns point estimate + 95% prediction interval (±30%) and cost tier. " +
            "Automatically incorporates the patient's latest SDOH composite risk weight.");

        group.MapGet("/cost-prediction/{patientId}", async (
            string patientId,
            PopHealthDbContext db,
            CancellationToken ct) =>
        {
            var latest = await db.CostPredictions
                .Where(p => p.PatientId == patientId)
                .OrderByDescending(p => p.PredictedAt)
                .FirstOrDefaultAsync(ct);

            if (latest is null) return Results.NotFound();

            return Results.Ok(new
            {
                latest.Id,
                latest.PatientId,
                Predicted12mCostUsd = latest.Predicted12mCost,
                LowerBound95Usd     = latest.LowerBound95,
                UpperBound95Usd     = latest.UpperBound95,
                latest.CostTier,
                CostDrivers         = latest.CostDrivers,
                latest.ModelVersion,
                latest.PredictedAt,
            });
        })
        .WithSummary("Get the latest cost prediction for a patient");

        // ── Risk Trajectory ─────────────────────────────────────────────────
        // Returns the full time-series of risk score snapshots for a patient.
        // Each snapshot captures RiskScore, RiskLevel, trend direction, and score
        // delta relative to the prior assessment.
        // Trajectory statistics (min, max, mean, slope) are included in the response.
        group.MapGet("/risks/{patientId}/trajectory", async (
            string patientId,
            int? maxPoints,
            RiskTrajectoryService trajSvc,
            CancellationToken ct) =>
        {
            var result = await trajSvc.GetTrajectoryAsync(patientId, maxPoints ?? 90, ct);
            return Results.Ok(result);
        })
        .WithSummary("Get risk score trajectory for a patient")
        .WithDescription(
            "Returns the chronological time-series of risk score snapshots for the given patient. " +
            "Includes per-point score delta, trend direction (Improving/Stable/Worsening), " +
            "and summary statistics (min, max, mean, linear regression slope). " +
            "Use maxPoints (default 90) to limit the response window.");

        return app;
    }
}

public sealed record CalculateRiskRequest(
    string PatientId,
    IReadOnlyList<string> Conditions,
    string? TriageLevel = null);

public sealed record HedisMeasureInput(
    int Age,
    string Sex,
    IReadOnlyList<string> Conditions,
    IReadOnlyList<string> Procedures,
    IReadOnlyList<string> Observations,
    DateTime? LastHbA1cDate,
    double? LastHbA1cValue,
    DateTime? LastBpDate,
    int? LastSystolicBp,
    int? LastDiastolicBp,
    DateTime? LastMammogramDate,
    DateTime? LastColorectalScreenDate,
    string? ColorectalScreenType);

public sealed record CostPredictionInput(
    string PatientId,
    string RiskLevel,
    IReadOnlyList<string> Conditions,
    double SdohWeight = 0.0);

public sealed record DrugInteractionCheckInput(IReadOnlyList<string> Drugs);
