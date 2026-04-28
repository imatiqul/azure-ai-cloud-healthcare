namespace HealthQCopilot.ServiceDefaults.Features;

/// <summary>
/// Centralised feature flag names used across all HealthQ Copilot microservices.
/// Names are namespaced under "HealthQ:" and must match the keys in Azure App Configuration.
/// </summary>
public static class HealthQFeatures
{
    // AI / Agentic
    public const string AgenticPlanning = "HealthQ:AgenticPlanning";
    public const string WearableStreaming = "HealthQ:WearableStreaming";
    public const string LlmClinicalCoding = "HealthQ:LlmClinicalCoding";
    public const string EpisodicMemory = "HealthQ:EpisodicMemory";
    /// <summary>
    /// Gates RAG context retrieval from Qdrant during triage and clinical coding.
    /// Disable to fall back to rule-based reasoning without vector-store enrichment.
    /// </summary>
    public const string RagRetrieval = "HealthQ:RagRetrieval";
    /// <summary>
    /// Gates the hallucination-guard fact-check pass after every LLM response.
    /// Disable during load testing or when evaluating raw model output.
    /// </summary>
    public const string HallucinationGuard = "HealthQ:HallucinationGuard";
    /// <summary>
    /// Gates the three microservice API plugins (Patient, Clinical, Scheduling) that
    /// make live HTTP calls to downstream services during the agentic planning loop.
    /// Disable to restrict the agent to offline/rule-based plugins only.
    /// </summary>
    public const string MicroserviceApiPlugins = "HealthQ:MicroserviceApiPlugins";

    /// <summary>
    /// Gates the PHI redaction layer that masks protected health information before
    /// any prompt leaves the process en route to Azure OpenAI. HIPAA blocker.
    /// </summary>
    public const string PhiRedaction = "HealthQ:PhiRedaction";

    /// <summary>
    /// Enables multi-agent handoff routing (W2). When off the legacy single-orchestrator
    /// path is used. Each handoff carries an <c>AgentHandoffEnvelope</c> with state,
    /// citations and remaining budget.
    /// </summary>
    public const string AgentHandoff = "HealthQ:AgentHandoff";

    /// <summary>
    /// Enables per-call token accounting and cost attribution via the
    /// <c>ITokenLedger</c> decorator over <c>IChatCompletionService</c>.
    /// </summary>
    public const string TokenAccounting = "HealthQ:TokenAccounting";

    /// <summary>
    /// Enables the clinical accuracy / groundedness / toxicity evaluation harness
    /// and its CI gate. Off in prod traffic; on in CI and shadow mode.
    /// </summary>
    public const string ClinicalEval = "HealthQ:ClinicalEval";

    /// <summary>
    /// Enforces patient-consent gating before invoking an LLM-backed agent path.
    /// </summary>
    public const string PatientConsentGate = "HealthQ:PatientConsentGate";

    /// <summary>
    /// Enforces tool RBAC: each agent role may only invoke a configured allow-list of plugins.
    /// </summary>
    public const string ToolRbac = "HealthQ:ToolRbac";

    /// <summary>
    /// Runs the W2.3 cross-agent <c>CriticAgent</c> after the hallucination guard
    /// and before commit. The critic verifies the answer is supported by the cited
    /// RAG sources; an unsupported verdict is treated as guard-rejected so the
    /// orchestrator falls back to the rule-based path.
    /// </summary>
    public const string CriticReview = "HealthQ:CriticReview";

    // Revenue Cycle
    public const string AutoPriorAuth = "HealthQ:AutoPriorAuth";
    public const string ShadowModeCoding = "HealthQ:ShadowModeCoding";

    // Patient Engagement
    public const string MfaEnforced = "HealthQ:MfaEnforced";
    public const string PatientRegistration = "HealthQ:PatientRegistration";

    // Platform
    public const string BreakGlassAlert = "HealthQ:BreakGlassAlert";
    public const string AuditExport = "HealthQ:AuditExport";
    public const string BillingMetering = "HealthQ:BillingMetering";
}
