using System.ComponentModel;
using System.Text.Json;
using Microsoft.SemanticKernel;

namespace HealthQCopilot.Agents.Plugins;

/// <summary>
/// Semantic Kernel plugin that provides the platform guide agent
/// with real-time access to all healthcare platform services.
/// Each function can be auto-invoked by the LLM to answer user questions.
/// </summary>
public sealed class PlatformGuidePlugin
{
    private readonly IHttpClientFactory _http;
    private readonly ILogger<PlatformGuidePlugin> _logger;

    // Service base URLs — resolved from Aspire service discovery or config
    private readonly string _schedulingBase;
    private readonly string _pophealthBase;
    private readonly string _revenueBase;
    private readonly string _agentsBase;
    private readonly string _voiceBase;

    public PlatformGuidePlugin(IHttpClientFactory http, IConfiguration config, ILogger<PlatformGuidePlugin> logger)
    {
        _http = http;
        _logger = logger;
        // In Aspire, services are discovered via config; in ACA, via env vars
        _schedulingBase = config["Services:SchedulingUrl"] ?? "http://scheduling-service";
        _pophealthBase = config["Services:PopHealthUrl"] ?? "http://pophealth-service";
        _revenueBase = config["Services:RevenueUrl"] ?? "http://revenue-service";
        _agentsBase = ""; // self — agent service
        _voiceBase = config["Services:VoiceUrl"] ?? "http://voice-service";
    }

    [KernelFunction("get_platform_overview")]
    [Description("Get an overview of the entire healthcare platform: what modules are available, what each one does, and how to navigate them.")]
    public string GetPlatformOverview()
    {
        return """
        HealthQ Copilot is a cloud-native healthcare AI platform with these modules:

        1. **Dashboard** (/) — Real-time metrics across all services: triage status, scheduling, population health, and revenue.
        2. **Voice Sessions** (/voice) — Start an AI-powered clinical encounter. Speech is transcribed in real-time via Azure Speech, then auto-triaged.
        3. **AI Triage** (/triage) — Review AI triage decisions. P1 (Immediate) cases require human-in-the-loop approval. P2-P4 auto-complete.
        4. **Scheduling** (/scheduling) — View available appointment slots, reserve, and book. Slots are organized by practitioner and date.
        5. **Population Health** (/population-health) — Patient risk stratification (Critical/High/Moderate/Low) and care gap tracking with closure rates.
        6. **Revenue Cycle** (/revenue) — ICD-10 coding queue (review/approve/submit claims) and prior authorization tracker (submit/approve/deny).

        The typical clinical workflow is: Voice Intake → AI Triage → Scheduling → Documentation → Coding → Prior Auth → Care Gap Monitoring.
        """;
    }

    [KernelFunction("get_triage_status")]
    [Description("Get current triage statistics: how many cases are pending, awaiting review, or completed.")]
    public async Task<string> GetTriageStatusAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_agentsBase}/api/v1/agents/stats");
            if (!res.IsSuccessStatusCode) return "Unable to fetch triage stats.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Triage Status: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch triage stats");
            return "Triage service is currently unavailable.";
        }
    }

    [KernelFunction("get_recent_triage_cases")]
    [Description("Get the most recent triage cases with their status and assigned priority level.")]
    public async Task<string> GetRecentTriageCasesAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_agentsBase}/api/v1/agents/triage");
            if (!res.IsSuccessStatusCode) return "Unable to fetch triage cases.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Recent Triage Cases: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch triage cases");
            return "Triage service is currently unavailable.";
        }
    }

    [KernelFunction("get_scheduling_status")]
    [Description("Get today's scheduling statistics: available slots, booked appointments, total bookings.")]
    public async Task<string> GetSchedulingStatusAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_schedulingBase}/api/v1/scheduling/stats");
            if (!res.IsSuccessStatusCode) return "Unable to fetch scheduling stats.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Scheduling Status: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch scheduling stats");
            return "Scheduling service is currently unavailable.";
        }
    }

    [KernelFunction("get_available_slots")]
    [Description("Get available appointment slots for a specific date. Provide date in YYYY-MM-DD format.")]
    public async Task<string> GetAvailableSlotsAsync(
        [Description("Date in YYYY-MM-DD format")] string date)
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_schedulingBase}/api/v1/scheduling/slots?date={date}");
            if (!res.IsSuccessStatusCode) return $"Unable to fetch slots for {date}.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Available slots for {date}: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch slots");
            return "Scheduling service is currently unavailable.";
        }
    }

    [KernelFunction("get_population_health_status")]
    [Description("Get population health statistics: high-risk patient count, total monitored patients, open and closed care gaps.")]
    public async Task<string> GetPopulationHealthStatusAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_pophealthBase}/api/v1/population-health/stats");
            if (!res.IsSuccessStatusCode) return "Unable to fetch population health stats.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Population Health: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch pop health stats");
            return "Population health service is currently unavailable.";
        }
    }

    [KernelFunction("get_high_risk_patients")]
    [Description("Get the list of high-risk or critical patients with their risk scores.")]
    public async Task<string> GetHighRiskPatientsAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_pophealthBase}/api/v1/population-health/risks?riskLevel=Critical&top=10");
            if (!res.IsSuccessStatusCode) return "Unable to fetch high-risk patients.";
            var json = await res.Content.ReadAsStringAsync();
            return $"High-Risk Patients: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch high-risk patients");
            return "Population health service is currently unavailable.";
        }
    }

    [KernelFunction("get_revenue_status")]
    [Description("Get revenue cycle statistics: coding queue size, reviewed/submitted claims, prior auth pending/approved/denied counts.")]
    public async Task<string> GetRevenueStatusAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_revenueBase}/api/v1/revenue/stats");
            if (!res.IsSuccessStatusCode) return "Unable to fetch revenue stats.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Revenue Cycle: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch revenue stats");
            return "Revenue service is currently unavailable.";
        }
    }

    [KernelFunction("get_coding_queue")]
    [Description("Get the current ICD-10 coding queue with patient names, suggested codes, and review status.")]
    public async Task<string> GetCodingQueueAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_revenueBase}/api/v1/revenue/coding-jobs");
            if (!res.IsSuccessStatusCode) return "Unable to fetch coding queue.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Coding Queue: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch coding queue");
            return "Revenue service is currently unavailable.";
        }
    }

    [KernelFunction("get_prior_auths")]
    [Description("Get the list of prior authorizations with their approval/denial status.")]
    public async Task<string> GetPriorAuthsAsync()
    {
        try
        {
            var client = _http.CreateClient();
            var res = await client.GetAsync($"{_revenueBase}/api/v1/revenue/prior-auths");
            if (!res.IsSuccessStatusCode) return "Unable to fetch prior authorizations.";
            var json = await res.Content.ReadAsStringAsync();
            return $"Prior Authorizations: {json}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch prior auths");
            return "Revenue service is currently unavailable.";
        }
    }

    [KernelFunction("guide_workflow_step")]
    [Description("Guide the user to the next step in the clinical workflow based on what they've completed. Provide the current step name: intake, triage, scheduling, documentation, coding, prior-auth, or monitoring.")]
    public string GuideWorkflowStep(
        [Description("Current workflow step: intake, triage, scheduling, documentation, coding, prior-auth, or monitoring")] string currentStep)
    {
        return currentStep.ToLowerInvariant() switch
        {
            "intake" or "voice" => """
                **Current: Patient Intake** — Navigate to Voice Sessions (/voice) to begin.
                1. Click "Start Session" to begin recording
                2. The AI will transcribe speech in real-time via SignalR
                3. Once the session ends, the transcript is automatically sent for AI triage
                **Next step:** AI Triage — the system will classify urgency (P1-P4) automatically.
                """,
            "triage" => """
                **Current: AI Triage** — Navigate to AI Triage (/triage) to review.
                1. The AI classifies each case as P1 (Immediate), P2 (Urgent), P3 (Standard), or P4 (Non-Urgent)
                2. P1 cases require human-in-the-loop approval before proceeding
                3. Review the AI's reasoning and approve or escalate
                **Next step:** Scheduling — book a follow-up appointment based on urgency.
                """,
            "scheduling" => """
                **Current: Scheduling** — Navigate to Scheduling (/scheduling).
                1. Select a date to view available practitioner slots
                2. Reserve a slot for the patient
                3. Confirm the booking with patient and practitioner details
                **Next step:** Documentation — the encounter details feed into medical coding.
                """,
            "documentation" or "coding" => """
                **Current: Medical Coding** — Navigate to Revenue Cycle (/revenue).
                1. The Coding Queue shows encounters with AI-suggested ICD-10 codes
                2. Review the suggested codes and approve or modify them
                3. Once approved, submit the claim for billing
                **Next step:** Prior Authorization — some procedures require insurer approval.
                """,
            "prior-auth" or "prior_auth" or "priorauth" => """
                **Current: Prior Authorization** — Navigate to Revenue Cycle (/revenue).
                1. Draft prior authorizations are listed with procedure details
                2. Submit them to the insurance payer for review
                3. Track approval/denial status and respond to denials
                **Next step:** Population Health Monitoring — track patient outcomes over time.
                """,
            "monitoring" or "population-health" or "pophealth" => """
                **Current: Population Health** — Navigate to Population Health (/population-health).
                1. View patient risk stratification across Critical, High, Moderate, and Low levels
                2. Monitor open care gaps and work to address them
                3. Track closure rates for quality metrics
                **This is the final step.** The workflow cycles back to intake for the next patient encounter.
                """,
            _ => """
                The clinical workflow follows these steps:
                1. **Voice Intake** (/voice) — Record patient encounter
                2. **AI Triage** (/triage) — Auto-classify urgency
                3. **Scheduling** (/scheduling) — Book follow-up
                4. **Medical Coding** (/revenue) — Review ICD-10 codes
                5. **Prior Authorization** (/revenue) — Submit for approval
                6. **Population Health** (/population-health) — Monitor outcomes

                Tell me which step you're at, and I'll guide you through it!
                """
        };
    }
}
