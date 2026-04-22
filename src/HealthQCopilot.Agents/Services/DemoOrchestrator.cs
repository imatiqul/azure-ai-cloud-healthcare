using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Domain.Agents;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Agents.Services;

public sealed class DemoOrchestrator
{
    private readonly AgentDbContext _db;
    private readonly GuideOrchestrator _guide;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<DemoOrchestrator> _logger;

    private static readonly Dictionary<DemoStep, StepDefinition> Steps = new()
    {
        [DemoStep.Welcome] = new("Welcome & Platform Overview",
            "Give me a complete overview of the HealthQ Copilot platform — what modules are available and the end-to-end workflow.",
            "How clear was the platform overview?",
            ["Clear", "Confusing", "Impressive", "Needs More Detail"]),

        [DemoStep.VoiceIntake] = new("Voice Intake Demo",
            "Guide me through the Voice Intake process — how does the AI-powered clinical encounter recording work?",
            "How useful is voice transcription?",
            ["Accurate", "Fast", "Needs Improvement", "Impressive"]),

        [DemoStep.AiTriage] = new("AI Triage Demo",
            "Show me how AI Triage works — how are patients classified by urgency and what's the human-in-the-loop process?",
            "How trustworthy is AI triage?",
            ["Trustworthy", "Needs Guardrails", "Fast", "Accurate"]),

        [DemoStep.Scheduling] = new("Scheduling Demo",
            "Show me the scheduling system — available slots, how to book appointments, and the scheduling workflow.",
            "How intuitive is scheduling?",
            ["Intuitive", "Complex", "Fast", "Missing Features"]),

        [DemoStep.RevenueCycle] = new("Revenue Cycle Demo",
            "Walk me through the Revenue Cycle — ICD-10 auto-coding, claim submission, and prior authorization tracking.",
            "How valuable is auto-coding?",
            ["Time-Saving", "Accurate", "Needs Review", "Valuable"]),

        [DemoStep.PopulationHealth] = new("Population Health Demo",
            "Show me Population Health monitoring — patient risk stratification, care gaps, and actionable insights.",
            "How actionable are the insights?",
            ["Actionable", "Clear", "Needs Context", "Useful"]),
    };

    public DemoOrchestrator(AgentDbContext db, GuideOrchestrator guide, IHttpClientFactory http,
        IConfiguration config, ILogger<DemoOrchestrator> logger)
    {
        _db = db;
        _guide = guide;
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<DemoStartResponse> StartDemoAsync(string clientName, string company, string? email, CancellationToken ct)
    {
        var session = DemoSession.Create(Guid.NewGuid(), clientName, company, email);
        _db.DemoSessions.Add(session);
        await _db.SaveChangesAsync(ct);

        // Auto-seed demo data via existing seed endpoints (fire and forget, idempotent)
        _ = Task.Run(() => SeedDemoDataAsync(), ct);

        // Get initial narration from the guide
        var narration = await GetStepNarrationAsync(session.GuideSessionId!.Value, DemoStep.Welcome, ct);

        return new DemoStartResponse(
            session.Id,
            session.GuideSessionId!.Value,
            session.CurrentStep.ToString(),
            narration,
            GetStepInfo(DemoStep.Welcome));
    }

    public async Task<DemoStepResponse> AdvanceStepAsync(Guid sessionId, CancellationToken ct)
    {
        var session = await _db.DemoSessions
            .Include(s => s.StepFeedbacks)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct)
            ?? throw new InvalidOperationException("Demo session not found");

        if (session.IsExpired())
        {
            session.Abandon();
            await _db.SaveChangesAsync(ct);
            return new DemoStepResponse(session.CurrentStep.ToString(), "Demo session has expired.", null, true);
        }

        session.AdvanceStep();
        await _db.SaveChangesAsync(ct);

        if (session.CurrentStep == DemoStep.Overall)
        {
            return new DemoStepResponse(
                session.CurrentStep.ToString(),
                "You've explored all platform modules! Please share your overall feedback to help us improve.",
                null,
                true);
        }

        var narration = await GetStepNarrationAsync(session.GuideSessionId!.Value, session.CurrentStep, ct);
        return new DemoStepResponse(
            session.CurrentStep.ToString(),
            narration,
            GetStepInfo(session.CurrentStep),
            false);
    }

    public async Task SubmitStepFeedbackAsync(Guid sessionId, DemoStep step, int rating, List<string> tags, string? comment, CancellationToken ct)
    {
        var exists = await _db.DemoSessions.AnyAsync(s => s.Id == sessionId, ct);
        if (!exists) throw new InvalidOperationException("Demo session not found");

        var feedback = StepFeedback.Create(sessionId, step, rating, tags, comment);
        _db.StepFeedbacks.Add(feedback);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<DemoCompleteResponse> CompleteDemoAsync(Guid sessionId, int npsScore, List<string> featurePriorities, string? comment, CancellationToken ct)
    {
        var session = await _db.DemoSessions
            .Include(s => s.StepFeedbacks)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct)
            ?? throw new InvalidOperationException("Demo session not found");

        session.Complete(npsScore, featurePriorities, comment);

        // Explicitly add OverallFeedback to ensure EF Core tracks it as Added
        if (session.OverallFeedback is not null)
            _db.OverallFeedbacks.Add(session.OverallFeedback);

        await _db.SaveChangesAsync(ct);

        var avgRating = session.StepFeedbacks.Count > 0
            ? session.StepFeedbacks.Average(f => f.Rating)
            : 0;

        return new DemoCompleteResponse(
            session.Id,
            npsScore,
            Math.Round(avgRating, 1),
            session.StepFeedbacks.Count,
            "Thank you for completing the HealthQ Copilot demo! Your feedback is invaluable for improving our platform.");
    }

    public async Task<DemoStatusResponse> GetStatusAsync(Guid sessionId, CancellationToken ct)
    {
        var session = await _db.DemoSessions
            .Include(s => s.StepFeedbacks)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct)
            ?? throw new InvalidOperationException("Demo session not found");

        return new DemoStatusResponse(
            session.Id,
            session.ClientName,
            session.Company,
            session.Status.ToString(),
            session.CurrentStep.ToString(),
            (int)session.CurrentStep,
            6,
            session.StepFeedbacks.Select(f => f.Step.ToString()).ToList(),
            session.StartedAt,
            session.CompletedAt);
    }

    public async Task<List<DemoSessionSummary>> GetSessionsAsync(CancellationToken ct)
    {
        return await _db.DemoSessions
            .Include(s => s.StepFeedbacks)
            .Include(s => s.OverallFeedback)
            .OrderByDescending(s => s.StartedAt)
            .Take(100)
            .Select(s => new DemoSessionSummary(
                s.Id,
                s.ClientName,
                s.Company,
                s.Status.ToString(),
                s.CurrentStep.ToString(),
                s.OverallFeedback != null ? s.OverallFeedback.NpsScore : (int?)null,
                s.StepFeedbacks.Count > 0 ? Math.Round(s.StepFeedbacks.Average(f => f.Rating), 1) : (double?)null,
                s.StartedAt,
                s.CompletedAt))
            .ToListAsync(ct);
    }

    public async Task<DemoInsight> GenerateInsightsAsync(CancellationToken ct)
    {
        var sessions = await _db.DemoSessions
            .Include(s => s.StepFeedbacks)
            .Include(s => s.OverallFeedback)
            .Where(s => s.Status == DemoStatus.Completed)
            .OrderByDescending(s => s.CompletedAt)
            .Take(50)
            .ToListAsync(ct);

        if (sessions.Count == 0)
            throw new InvalidOperationException("No completed demo sessions to analyze");

        var avgNps = sessions
            .Where(s => s.OverallFeedback != null)
            .Average(s => s.OverallFeedback!.NpsScore);

        var allFeedbacks = sessions.SelectMany(s => s.StepFeedbacks).ToList();

        // Aggregate step ratings
        var stepRatings = allFeedbacks
            .GroupBy(f => f.Step)
            .ToDictionary(g => g.Key, g => Math.Round(g.Average(f => f.Rating), 1));

        // Find top strengths (highest rated steps)
        var strengths = stepRatings.OrderByDescending(kv => kv.Value).Take(3)
            .Select(kv => $"{kv.Key}: {kv.Value}/5");

        // Find weaknesses (lowest rated steps)
        var weaknesses = stepRatings.OrderBy(kv => kv.Value).Take(3)
            .Select(kv => $"{kv.Key}: {kv.Value}/5");

        // Tag frequency analysis
        var tagFreq = allFeedbacks.SelectMany(f => f.Tags)
            .GroupBy(t => t)
            .OrderByDescending(g => g.Count())
            .Take(10)
            .Select(g => $"{g.Key} ({g.Count()})");

        // Feature priorities from overall feedback
        var priorities = sessions
            .Where(s => s.OverallFeedback != null)
            .SelectMany(s => s.OverallFeedback!.FeaturePriorities)
            .GroupBy(p => p)
            .OrderByDescending(g => g.Count())
            .Take(5)
            .Select(g => $"{g.Key} ({g.Count()} votes)");

        var insight = DemoInsight.Create(
            sessionsAnalyzed: sessions.Count,
            averageNps: Math.Round(avgNps, 1),
            topStrengths: string.Join("; ", strengths),
            topWeaknesses: string.Join("; ", weaknesses),
            recommendations: $"Top feature priorities: {string.Join(", ", priorities)}. Most mentioned tags: {string.Join(", ", tagFreq)}.",
            rawAnalysis: System.Text.Json.JsonSerializer.Serialize(new
            {
                StepRatings = stepRatings.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value),
                CompletionRate = sessions.Count(s => s.Status == DemoStatus.Completed) * 100.0 / sessions.Count,
                AverageStepFeedbacks = sessions.Average(s => s.StepFeedbacks.Count)
            }));

        _db.DemoInsights.Add(insight);
        await _db.SaveChangesAsync(ct);
        return insight;
    }

    private async Task<string> GetStepNarrationAsync(Guid guideSessionId, DemoStep step, CancellationToken ct)
    {
        if (!Steps.TryGetValue(step, out var def))
            return "Welcome to the demo!";

        try
        {
            var response = await _guide.ChatAsync(guideSessionId, def.AutoPrompt, ct);
            return response.Message;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get AI narration for step {Step}, using fallback", step);
            return $"**{def.Title}**\n\nLet me walk you through this module. Please explore the features shown on screen.";
        }
    }

    private static StepInfo? GetStepInfo(DemoStep step)
    {
        if (!Steps.TryGetValue(step, out var def)) return null;
        return new StepInfo(step.ToString(), def.Title, def.FeedbackQuestion, def.FeedbackTags);
    }

    private async Task SeedDemoDataAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var schedulingBase = _config["Services:SchedulingUrl"]  ?? "http://scheduling-service";
            var pophealthBase  = _config["Services:PopHealthUrl"]    ?? "http://pophealth-service";
            var revenueBase    = _config["Services:RevenueUrl"]      ?? "http://revenue-service";
            var identityBase   = _config["Services:IdentityUrl"]     ?? "http://identity-service";
            var voiceBase      = _config["Services:VoiceUrl"]        ?? "http://voice-service";
            // Agents seed is self-hosted — call localhost to avoid circular dependency via APIM
            var agentsBase     = _config["Services:AgentsUrl"]       ?? "http://localhost";

            await Task.WhenAll(
                client.PostAsync($"{schedulingBase}/api/v1/scheduling/seed",         null),
                client.PostAsync($"{pophealthBase}/api/v1/population-health/seed",   null),
                client.PostAsync($"{revenueBase}/api/v1/revenue/seed",               null),
                client.PostAsync($"{identityBase}/api/v1/identity/seed",             null),
                client.PostAsync($"{voiceBase}/api/v1/voice/seed",                   null),
                client.PostAsync($"{agentsBase}/api/v1/agents/seed",                 null));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Demo data seeding failed (non-critical)");
        }
    }

    private sealed record StepDefinition(string Title, string AutoPrompt, string FeedbackQuestion, List<string> FeedbackTags);
}

// Response DTOs
public record DemoStartResponse(Guid SessionId, Guid GuideSessionId, string CurrentStep, string Narration, StepInfo? StepInfo);
public record DemoStepResponse(string CurrentStep, string Narration, StepInfo? StepInfo, bool IsComplete);
public record DemoCompleteResponse(Guid SessionId, int NpsScore, double AverageStepRating, int StepsCompleted, string Message);
public record DemoStatusResponse(Guid SessionId, string ClientName, string Company, string Status, string CurrentStep, int StepNumber, int TotalSteps, List<string> CompletedFeedbacks, DateTime StartedAt, DateTime? CompletedAt);
public record DemoSessionSummary(Guid SessionId, string ClientName, string Company, string Status, string LastStep, int? NpsScore, double? AvgRating, DateTime StartedAt, DateTime? CompletedAt);
public record StepInfo(string Step, string Title, string FeedbackQuestion, List<string> FeedbackTags);
