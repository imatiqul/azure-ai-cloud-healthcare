using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Endpoints;

public static class AgentEndpoints
{
    public static IEndpointRouteBuilder MapAgentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/agents")
            .WithTags("Agents")
            .WithAutoValidation();

        group.MapPost("/triage", async (
            StartTriageRequest request,
            TriageOrchestrator orchestrator,
            CancellationToken ct) =>
        {
            var workflow = await orchestrator.RunTriageAsync(request.SessionId, request.TranscriptText, request.PatientId ?? request.SessionId.ToString(), ct);
            return Results.Created($"/api/v1/agents/triage/{workflow.Id}",
                new { workflow.Id, Status = workflow.Status.ToString(), AssignedLevel = workflow.AssignedLevel?.ToString(), workflow.AgentReasoning });
        });

        group.MapGet("/triage/{id:guid}", async (
            Guid id,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows
                .FirstOrDefaultAsync(w => w.Id == id, ct);
            return workflow is null ? Results.NotFound() : Results.Ok(workflow);
        });

        group.MapPost("/triage/{id:guid}/approve", async (
            Guid id,
            AgentDbContext db,
            WorkflowDispatcher dispatcher,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();
            if (workflow.Status != WorkflowStatus.AwaitingHumanReview)
                return Results.BadRequest(new { error = "Workflow is not awaiting human review" });
            workflow.ApproveEscalation();
            await db.SaveChangesAsync(ct);
            // Dispatch cross-service actions (scheduling, FHIR, notifications) after human approval
            _ = Task.Run(() => dispatcher.DispatchAsync(workflow, workflow.SessionId, CancellationToken.None), CancellationToken.None);
            return Results.Ok(new { workflow.Id, Status = workflow.Status.ToString(), AssignedLevel = workflow.AssignedLevel?.ToString() });
        });

        group.MapPost("/triage/{id:guid}/reject", async (
            Guid id,
            RejectTriageRequest request,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflow = await db.TriageWorkflows.FindAsync([id], ct);
            if (workflow is null) return Results.NotFound();
            if (workflow.Status != WorkflowStatus.AwaitingHumanReview)
                return Results.BadRequest(new { error = "Workflow is not awaiting human review" });
            workflow.Reject(request.Reason);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { workflow.Id, Status = workflow.Status.ToString() });
        });

        group.MapGet("/triage", async (
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var workflows = await db.TriageWorkflows
                .OrderByDescending(w => w.CreatedAt)
                .Take(50)
                .Select(w => new { w.Id, w.SessionId, Status = w.Status.ToString(), AssignedLevel = w.AssignedLevel != null ? w.AssignedLevel.ToString() : null, w.AgentReasoning, w.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(workflows);
        });

        group.MapGet("/decisions/{workflowId:guid}", async (
            Guid workflowId,
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var decisions = await db.AgentDecisions
                .Where(d => d.WorkflowId == workflowId)
                .OrderBy(d => d.CreatedAt)
                .ToListAsync(ct);
            return Results.Ok(decisions);
        });

        group.MapGet("/stats", async (
            AgentDbContext db,
            CancellationToken ct) =>
        {
            var pending = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.Pending || w.Status == WorkflowStatus.Processing, ct);
            var awaitingReview = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.AwaitingHumanReview, ct);
            var completed = await db.TriageWorkflows.CountAsync(w => w.Status == WorkflowStatus.Completed, ct);
            return Results.Ok(new { pendingTriage = pending, awaitingReview, completed });
        });

        // ── Phase 6 — Agentic AI Maturity endpoints ───────────────────────────

        // XAI: retrieve the reasoning audit trail for a specific agent decision
        group.MapGet("/decisions/{id:guid}/explanation", async (
            Guid id,
            XaiExplainabilityService xai,
            CancellationToken ct) =>
        {
            var entry = await xai.GetReasoningAsync(id, ct);
            if (entry is null) return Results.NotFound(new { error = "No reasoning audit found for this decision ID." });

            // Compute LLM confidence interval alongside the reasoning audit
            var confidence = xai.ComputeLlmConfidence(
                guardVerdict:       entry.GuardVerdict,
                ragChunkCount:      entry.GetRagChunkIds().Count,
                planningIterations: entry.GetReasoningSteps().Count,
                avgLogProbability:  null); // log-probs not persisted; use LIME-fallback

            return Results.Ok(new
            {
                entry.AgentDecisionId,
                entry.AgentName,
                entry.GuardVerdict,
                entry.ConfidenceScore,
                RagChunks      = entry.GetRagChunkIds(),
                ReasoningSteps = entry.GetReasoningSteps(),
                entry.CreatedAt,
                ConfidenceInterval = new
                {
                    confidence.ConfidenceLevel,
                    confidence.DecisionConfidence,
                    confidence.LowerBound95,
                    confidence.UpperBound95,
                    confidence.Method,
                    confidence.Interpretation,
                },
            });
        })
        .WithSummary("Retrieve the reasoning audit trail and confidence interval for an agent decision");

        // XAI: compute confidence interval for an ML readmission risk score
        group.MapPost("/decisions/ml-confidence", (
            MlConfidenceRequest req,
            XaiExplainabilityService xai) =>
        {
            var confidence = xai.ComputeMlConfidence(req.Probability, req.FeatureValues);
            var importance  = req.FeatureValues is { Length: > 0 }
                ? xai.ComputeFeatureImportance(req.Probability, req.FeatureValues)
                : null;

            return Results.Ok(new
            {
                req.Probability,
                ConfidenceInterval = confidence,
                FeatureImportance  = importance,
            });
        })
        .WithSummary("Compute confidence interval and feature importance for an ML risk score")
        .WithDescription(
            "Accepts the ML.NET predicted probability and optional feature vector. " +
            "Returns 95% CI using boundary-distance + feature-stability analysis (LIME-fallback when " +
            "no features supplied). Also returns permutation-based feature importance when features provided.");

        // LLM clinical coding agent: code an encounter using the planning loop
        group.MapPost("/coding/code-encounter", async (
            CodeEncounterRequest request,
            ClinicalCoderAgent agent,
            CancellationToken ct) =>
        {
            var result = await agent.CodeEncounterAsync(
                request.WorkflowId,
                request.EncounterTranscript,
                request.Payer ?? "Medicare",
                ct);

            return Results.Ok(new
            {
                result.WorkflowId,
                result.FinalAnswer,
                result.ReasoningSteps,
                result.Iterations,
                result.GoalAchieved,
                result.Payer,
                result.CodingAgentVersion,
            });
        });

        // A/B experiment summary
        group.MapGet("/experiments/{experimentId}/summary", async (
            string experimentId,
            PromptExperimentService experiments,
            CancellationToken ct) =>
        {
            var summary = await experiments.GetExperimentSummaryAsync(experimentId, ct);
            return Results.Ok(summary);
        });

        // ── Clinician RAG Feedback Loop ───────────────────────────────────────
        // Clinicians rate AI-generated triage/guide responses 1–5.
        // Positive ratings (≥4) ingest approved text into Qdrant KB.
        // Negative ratings (≤2) with corrections ingest replacement text into Qdrant KB.
        group.MapPost("/feedback", async (
            ClinicianFeedbackInput input,
            ClinicianFeedbackService feedbackSvc,
            CancellationToken ct) =>
        {
            if (input.Rating is < 1 or > 5)
                return Results.BadRequest(new { error = "Rating must be 1–5" });
            if (string.IsNullOrWhiteSpace(input.ClinicianId))
                return Results.BadRequest(new { error = "ClinicianId is required" });

            var result = await feedbackSvc.SubmitFeedbackAsync(input, ct);
            return Results.Ok(result);
        })
        .WithSummary("Submit clinician feedback on an AI response — updates RAG knowledge base")
        .WithDescription(
            "Records a clinician rating (1–5) for an AI-generated triage or guide response. " +
            "Ratings ≥ 4 embed the approved text into the Qdrant clinical-kb collection so " +
            "future RAG retrievals surface clinician-validated content. " +
            "Ratings ≤ 2 with a correctedText ingest the correction as a replacement chunk. " +
            "Ratings 3 are logged but do not mutate the knowledge base.");

        group.MapGet("/feedback/summary", async (
            DateTime? since,
            ClinicianFeedbackService feedbackSvc,
            CancellationToken ct) =>
        {
            var summary = await feedbackSvc.GetSummaryAsync(since, ct);
            return Results.Ok(summary);
        })
        .WithSummary("Get clinician feedback quality summary (last 30 days by default)");

        return app;
    }
}

public record StartTriageRequest(Guid SessionId, string TranscriptText, string? PatientId);
public record RejectTriageRequest(string Reason);
public record CodeEncounterRequest(Guid WorkflowId, string EncounterTranscript, string? Payer);

/// <summary>Input for ML confidence interval computation.</summary>
public sealed record MlConfidenceRequest(
    /// <summary>ML.NET predicted probability P(readmission=true) [0, 1].</summary>
    double Probability,
    /// <summary>
    /// Optional 7-element feature vector in ReadmissionFeatures order:
    /// [AgeBucket, ComorbidityCount, TriageLevelOrdinal, PriorAdmissions12M,
    ///  LengthOfStayDays, DischargeDispositionOrdinal, ConditionWeightSum].
    /// When null, a LIME-fallback confidence estimate is returned.
    /// </summary>
    float[]? FeatureValues = null);
