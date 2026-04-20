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
