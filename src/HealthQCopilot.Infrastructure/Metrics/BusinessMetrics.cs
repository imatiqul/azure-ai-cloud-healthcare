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
    }
}
