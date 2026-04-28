namespace HealthQCopilot.Agents.Services.Orchestration;

/// <summary>
/// W2.2 — decomposes a high-level user intent into ordered sub-goals. The
/// initial implementation uses keyword heuristics; once
/// <c>HealthQ:AgentHandoff</c> stabilises this is replaced by an LLM-driven
/// planner. Sub-goal status is tracked in the trace recorder under a session.
/// </summary>
public interface IGoalDecomposer
{
    IReadOnlyList<SubGoal> Decompose(string intent);
}

public sealed record SubGoal(string Id, string Description, string PreferredAgent, int Order);

public sealed class HeuristicGoalDecomposer : IGoalDecomposer
{
    public IReadOnlyList<SubGoal> Decompose(string intent)
    {
        var i = (intent ?? string.Empty).ToLowerInvariant();
        var goals = new List<SubGoal>();
        var order = 0;

        goals.Add(new SubGoal(NewId(), "Triage user request and determine urgency", "Triage", order++));

        if (i.Contains("code") || i.Contains("icd") || i.Contains("cpt"))
            goals.Add(new SubGoal(NewId(), "Suggest clinical billing codes", "ClinicalCoder", order++));

        if (i.Contains("auth") || i.Contains("approval") || i.Contains("prior"))
            goals.Add(new SubGoal(NewId(), "Run prior authorisation check", "PriorAuth", order++));

        if (i.Contains("gap") || i.Contains("preventive") || i.Contains("screening"))
            goals.Add(new SubGoal(NewId(), "Surface care gaps", "CareGap", order++));

        if (i.Contains("schedule") || i.Contains("appointment") || i.Contains("book"))
            goals.Add(new SubGoal(NewId(), "Book or reschedule appointment", "Scheduling", order++));

        return goals;

        static string NewId() => Guid.NewGuid().ToString("n")[..8];
    }
}
