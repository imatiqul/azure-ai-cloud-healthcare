using System.Diagnostics.Metrics;

namespace HealthQCopilot.Infrastructure.Metrics;

/// <summary>
/// Healthcare platform business metrics exposed via OpenTelemetry/Prometheus.
/// Each service registers the meters it needs via AddBusinessMetrics().
/// </summary>
public sealed class BusinessMetrics
{
    private readonly Meter _meter;

    // ── Triage ───────────────────────────────────────────
    public Counter<long> TriageRequestsTotal { get; }
    public Counter<long> TriageEscalationsTotal { get; }
    public Histogram<double> TriageLatencyMs { get; }

    // ── Scheduling ───────────────────────────────────────
    public Counter<long> BookingsCreatedTotal { get; }
    public Counter<long> SlotsReservedTotal { get; }
    public Counter<long> BookingCancellationsTotal { get; }
    public Counter<long> WaitlistEnqueuedTotal { get; }    // Phase 12
    public Counter<long> WaitlistPromotedTotal { get; }    // Phase 12
    // ── Revenue Cycle ────────────────────────────────────
    public Counter<long> CodingJobsCreatedTotal { get; }
    public Counter<long> CodingJobsSubmittedTotal { get; }
    public Counter<long> PriorAuthsSubmittedTotal { get; }
    public Counter<long> PriorAuthsDeniedTotal { get; }
    public Counter<long> DenialOpenedTotal { get; }        // Phase 12
    public Counter<long> DenialAppealedTotal { get; }      // Phase 12
    // ── OCR ──────────────────────────────────────────────
    public Counter<long> OcrJobsCreatedTotal { get; }
    public Counter<long> OcrJobsCompletedTotal { get; }
    public Counter<long> OcrJobsFailedTotal { get; }
    public Histogram<double> OcrProcessingLatencyMs { get; }

    // ── Notifications ────────────────────────────────────
    public Counter<long> CampaignsCreatedTotal { get; }   // Phase 28
    public Counter<long> CampaignsActivatedTotal { get; }
    public Counter<long> MessagesSentTotal { get; }
    public Counter<long> MessagesFailedTotal { get; }
    public Counter<long> NotificationDeliveredTotal { get; } // Phase 12 delivery confirmation
    public Counter<long> NotificationFailedTotal { get; }    // Phase 12 delivery failure
    // ── Voice ────────────────────────────────────────────
    public Counter<long> VoiceSessionsStartedTotal { get; }
    public Counter<long> VoiceSessionsEndedTotal { get; }
    public Histogram<double> VoiceSessionDurationMs { get; }

    // ── Population Health ────────────────────────────────
    public Counter<long> RiskAssessmentsTotal { get; }
    public Counter<long> CareGapsIdentifiedTotal { get; }
    public Counter<long> CareGapsAddressedTotal { get; }

    // ── Identity ─────────────────────────────────────────
    public Counter<long> UserLoginsTotal { get; }
    public Counter<long> UsersCreatedTotal { get; }
    public Counter<long> BreakGlassGrantedTotal { get; }    // Phase 16 — HIPAA §164.312 audit event
    public Counter<long> GdprErasureRequestedTotal { get; } // Phase 16 — GDPR Art. 17 erasure
    // ── Guide ────────────────────────────────────────────
    public Counter<long> GuideConversationsTotal { get; }
    public Histogram<double> GuideResponseLatencyMs { get; }
    public Counter<long> GuideStreamingSessionsTotal { get; } // Phase 16 SSE streaming
    public Counter<long> GuideStreamingTokensTotal { get; }   // Phase 16 token throughput
    // ── AI Hallucination Guard ───────────────────────────
    /// <summary>
    /// Labelled by verdict="safe"|"unsafe".
    /// Used by Argo Rollouts AnalysisTemplate to block canary if unsafe rate > 5%.
    /// Prometheus query: sum(rate(agent_guard_verdict_total{verdict="unsafe"}[5m])) / sum(rate(agent_guard_verdict_total[5m]))
    /// </summary>
    public Counter<long> AgentGuardVerdictTotal { get; }
    public Counter<long> MlConfidenceComputedTotal { get; } // Phase 28

    // ── LLM Token Usage (Phase 39 — cost attribution) ────────────────────────
    /// <summary>Total LLM prompt tokens consumed. Tagged by agent and tenant.</summary>
    public Counter<long> LlmPromptTokensTotal { get; }
    /// <summary>Total LLM completion tokens generated. Tagged by agent and tenant.</summary>
    public Counter<long> LlmCompletionTokensTotal { get; }
    /// <summary>Latency histogram per LLM call from first token to completion (ms).</summary>
    public Histogram<double> LlmCallLatencyMs { get; }

    /// <summary>W4.2 — estimated USD spend per LLM call. Tagged by agent + tenant + model. Drives <c>agent_llm_cost_usd_total</c> on the agent-cost Grafana dashboard and feeds Azure Cost Management tag-based billing.</summary>
    public Counter<double> AgentLlmCostUsdTotal { get; }

    /// <summary>W4.3 — end-to-end agentic planning loop latency (ms). Tagged by agent + outcome.</summary>
    public Histogram<double> AgentPlanningLoopMs { get; }

    /// <summary>W3.2 — LLM-as-judge groundedness score (0.0–1.0) per evaluated answer.</summary>
    public Histogram<double> AgentGroundednessScore { get; }

    /// <summary>W3.3 — normalized toxicity severity (0.0–1.0) per evaluated answer (Azure Content Safety).</summary>
    public Histogram<double> AgentToxicityScore { get; }

    /// <summary>W3.3 — count of agent answers flagged above the toxicity threshold. Tagged by category.</summary>
    public Counter<long> AgentToxicityFlaggedTotal { get; }

    /// <summary>W3.4 — clinician feedback submissions. Tagged by sentiment=positive|neutral|negative and action.</summary>
    public Counter<long> AgentFeedbackTotal { get; }

    /// <summary>W2.4 — count of plugin invocations denied by tool-RBAC. Tagged by agent + plugin.</summary>
    public Counter<long> AgentToolRbacDeniedTotal { get; }

    /// <summary>P4.2 — per-session handoff depth (number of agent-to-agent handoffs within one planning session). Tagged by from_agent + to_agent. Used by the Argo AnalysisTemplate quality gate once a sufficient baseline is established.</summary>
    public Histogram<int> AgentHandoffDepth { get; }

    // ── Idempotency (Phase 39 — duplicate request prevention) ─────────────────
    /// <summary>POST requests served from idempotency cache (client retry deduplication).</summary>
    public Counter<long> IdempotencyHitsTotal { get; }

    // ── Confidence Routing (Phase 39 — AI confidence-based workflow routing) ──
    /// <summary>Triage decisions routed by AI confidence band. Tagged by routing=auto-escalate|standard-hitl|fast-track.</summary>
    public Counter<long> ConfidenceRoutingTotal { get; }

    public BusinessMetrics(IMeterFactory meterFactory)
    {
        _meter = meterFactory.Create("HealthQCopilot.Business");

        // Triage
        TriageRequestsTotal = _meter.CreateCounter<long>(
            "healthq.triage.requests.total", description: "Total triage classification requests");
        TriageEscalationsTotal = _meter.CreateCounter<long>(
            "healthq.triage.escalations.total", description: "Total P1 escalations requiring human review");
        TriageLatencyMs = _meter.CreateHistogram<double>(
            "healthq.triage.latency.ms", "ms", "Triage classification latency");

        // Scheduling
        BookingsCreatedTotal = _meter.CreateCounter<long>(
            "healthq.scheduling.bookings.total", description: "Total bookings created");
        SlotsReservedTotal = _meter.CreateCounter<long>(
            "healthq.scheduling.reservations.total", description: "Total slot reservations");
        BookingCancellationsTotal = _meter.CreateCounter<long>(
            "healthq.scheduling.cancellations.total", description: "Total booking cancellations");
        WaitlistEnqueuedTotal = _meter.CreateCounter<long>(
            "healthq.scheduling.waitlist.enqueued.total", description: "Total patients added to waitlist");
        WaitlistPromotedTotal = _meter.CreateCounter<long>(
            "healthq.scheduling.waitlist.promoted.total", description: "Total patients promoted from waitlist to booking");

        // Revenue
        CodingJobsCreatedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.coding_jobs.created.total", description: "Total coding jobs created");
        CodingJobsSubmittedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.coding_jobs.submitted.total", description: "Total coding jobs submitted to payers");
        PriorAuthsSubmittedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.prior_auths.submitted.total", description: "Total prior auths submitted");
        PriorAuthsDeniedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.prior_auths.denied.total", description: "Total prior auths denied");
        DenialOpenedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.denials.opened.total", description: "Total denial management cases opened");
        DenialAppealedTotal = _meter.CreateCounter<long>(
            "healthq.revenue.denials.appealed.total", description: "Total denials formally appealed");

        // OCR
        OcrJobsCreatedTotal = _meter.CreateCounter<long>(
            "healthq.ocr.jobs.created.total", description: "Total OCR jobs created");
        OcrJobsCompletedTotal = _meter.CreateCounter<long>(
            "healthq.ocr.jobs.completed.total", description: "Total OCR jobs completed");
        OcrJobsFailedTotal = _meter.CreateCounter<long>(
            "healthq.ocr.jobs.failed.total", description: "Total OCR jobs failed");
        OcrProcessingLatencyMs = _meter.CreateHistogram<double>(
            "healthq.ocr.processing.latency.ms", "ms", "OCR document processing latency");

        // Notifications
        CampaignsCreatedTotal = _meter.CreateCounter<long>(
            "healthq.notifications.campaigns.created.total", description: "Total outreach campaigns created"); // Phase 28
        CampaignsActivatedTotal = _meter.CreateCounter<long>(
            "healthq.notifications.campaigns.activated.total", description: "Total campaigns activated");
        MessagesSentTotal = _meter.CreateCounter<long>(
            "healthq.notifications.messages.sent.total", description: "Total notification messages sent");
        MessagesFailedTotal = _meter.CreateCounter<long>(
            "healthq.notifications.messages.failed.total", description: "Total notification messages failed");
        NotificationDeliveredTotal = _meter.CreateCounter<long>(
            "healthq.notifications.delivery.success.total", description: "Total notifications confirmed delivered by provider");
        NotificationFailedTotal = _meter.CreateCounter<long>(
            "healthq.notifications.delivery.failed.total", description: "Total notifications with confirmed delivery failure");

        // Voice
        VoiceSessionsStartedTotal = _meter.CreateCounter<long>(
            "healthq.voice.sessions.started.total", description: "Total voice sessions started");
        VoiceSessionsEndedTotal = _meter.CreateCounter<long>(
            "healthq.voice.sessions.ended.total", description: "Total voice sessions ended");
        VoiceSessionDurationMs = _meter.CreateHistogram<double>(
            "healthq.voice.session.duration.ms", "ms", "Voice session duration");

        // Population Health
        RiskAssessmentsTotal = _meter.CreateCounter<long>(
            "healthq.pophealth.risk_assessments.total", description: "Total risk assessments performed");
        CareGapsIdentifiedTotal = _meter.CreateCounter<long>(
            "healthq.pophealth.care_gaps.identified.total", description: "Total care gaps identified");
        CareGapsAddressedTotal = _meter.CreateCounter<long>(
            "healthq.pophealth.care_gaps.addressed.total", description: "Total care gaps addressed");

        // Identity
        UserLoginsTotal = _meter.CreateCounter<long>(
            "healthq.identity.logins.total", description: "Total user logins recorded");
        UsersCreatedTotal = _meter.CreateCounter<long>(
            "healthq.identity.users.created.total", description: "Total user accounts created");
        BreakGlassGrantedTotal = _meter.CreateCounter<long>(
            "healthq.identity.break_glass.granted.total",
            description: "Total break-glass emergency access grants. HIPAA §164.312 audit events.");
        GdprErasureRequestedTotal = _meter.CreateCounter<long>(
            "healthq.identity.erasure.requested.total",
            description: "Total GDPR Art. 17 right-to-erasure requests initiated.");

        // Guide
        GuideConversationsTotal = _meter.CreateCounter<long>(
            "healthq.guide.conversations.total", description: "Total guide conversations started");
        GuideResponseLatencyMs = _meter.CreateHistogram<double>(
            "healthq.guide.response.latency.ms", "ms", "Guide AI response latency");
        GuideStreamingSessionsTotal = _meter.CreateCounter<long>(
            "healthq.guide.streaming.sessions.total", description: "Total guide SSE streaming sessions opened");
        GuideStreamingTokensTotal = _meter.CreateCounter<long>(
            "healthq.guide.streaming.tokens.total", description: "Total LLM tokens streamed to clients via SSE");

        // Hallucination Guard
        AgentGuardVerdictTotal = _meter.CreateCounter<long>(
            "agent_guard_verdict_total",
            description: "Total AI agent guard verdicts. Labels: verdict=safe|unsafe, agent=<name>");

        // XAI — ML Confidence
        MlConfidenceComputedTotal = _meter.CreateCounter<long>(
            "healthq.xai.ml_confidence.computed.total",
            description: "Total ML readmission risk confidence computations performed"); // Phase 28

        // LLM Token Usage (Phase 39)
        LlmPromptTokensTotal = _meter.CreateCounter<long>(
            "healthq.llm.prompt_tokens.total",
            description: "Total LLM prompt tokens consumed. Use for per-tenant Azure OpenAI cost attribution.");
        LlmCompletionTokensTotal = _meter.CreateCounter<long>(
            "healthq.llm.completion_tokens.total",
            description: "Total LLM completion tokens generated. Drives cost-per-workflow analysis.");
        LlmCallLatencyMs = _meter.CreateHistogram<double>(
            "healthq.llm.call.latency.ms", "ms",
            "End-to-end LLM call latency (prompt submission to full response receipt).");

        // W4.2 — cost attribution counter. Friendly metric name `agent_llm_cost_usd_total`
        // (matches the documented contract on `TokenUsageRecord` and the cost dashboard).
        AgentLlmCostUsdTotal = _meter.CreateCounter<double>(
            "agent_llm_cost_usd_total", "USD",
            "Estimated USD spend per LLM call. Tags: agent, tenant, model.");

        // W4.3 — planning-loop latency SLO (alert when p99 > 5 s).
        AgentPlanningLoopMs = _meter.CreateHistogram<double>(
            "agent_planning_loop_ms", "ms",
            "End-to-end agentic planning loop latency. Tags: agent, outcome=goal_met|max_iterations|error|guard_rejected.");

        // W3.2 — groundedness score from LLM-as-judge (0.0–1.0; alert mean < 0.7).
        AgentGroundednessScore = _meter.CreateHistogram<double>(
            "agent_groundedness_score", "score",
            "LLM-as-judge groundedness score per evaluated agent answer (0.0–1.0).");

        // W3.3 — toxicity / bias screening (Azure Content Safety).
        AgentToxicityScore = _meter.CreateHistogram<double>(
            "agent_toxicity_score", "score",
            "Normalized max-category toxicity severity (0.0–1.0) per evaluated agent answer.");
        AgentToxicityFlaggedTotal = _meter.CreateCounter<long>(
            "agent_toxicity_flagged_total",
            description: "Agent answers flagged above the toxicity severity threshold. Tags: category=Hate|Violence|SelfHarm|Sexual.");

        // W3.4 — clinician feedback ingestion telemetry.
        AgentFeedbackTotal = _meter.CreateCounter<long>(
            "agent_feedback_total",
            description: "Clinician feedback submissions. Tags: sentiment=positive|neutral|negative, action=logged|ingested-into-qdrant|correction-ingested|logged-qdrant-failed.");

        // Tool RBAC (W2.4)
        AgentToolRbacDeniedTotal = _meter.CreateCounter<long>(
            "agent_tool_rbac_denied_total",
            description: "Plugin invocations denied by AgentToolPolicy. Tags: agent=<name>, plugin=<name>.");

        // P4.2 — handoff depth histogram. Incremented once per HandoffAsync call
        // with the current cumulative depth for the session so Prometheus sees
        // both the per-hop value and the full per-session distribution.
        // Enables the Argo quality gate to replace the Kusto sidecar probe
        // documented in the P4.2 runbook § 4 as future work.
        AgentHandoffDepth = _meter.CreateHistogram<int>(
            "agent_handoff_depth",
            description: "Cumulative handoff depth within a planning session. Tags: from_agent, to_agent.");

        // Idempotency (Phase 39)
        IdempotencyHitsTotal = _meter.CreateCounter<long>(
            "healthq.api.idempotency.hits.total",
            description: "POST requests served from idempotency cache (client retry deduplication). High rate indicates aggressive client retries.");

        // Confidence Routing (Phase 39)
        ConfidenceRoutingTotal = _meter.CreateCounter<long>(
            "healthq.ai.confidence_routing.total",
            description: "Triage decisions routed by AI confidence band. Tags: routing=auto-escalate|standard-hitl|fast-track.");
    }
}
