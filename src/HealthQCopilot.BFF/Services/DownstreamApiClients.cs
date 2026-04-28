using System.Text.Json;
using System.Text.Json.Serialization;

namespace HealthQCopilot.BFF.Services;

// ── Shared DTOs ──────────────────────────────────────────────────────────────

public sealed record PatientRiskDto(
    string Id,
    string PatientId,
    string Level,
    double RiskScore,
    string[] Conditions,
    string AssessedAt);

public sealed record CareGapDto(
    string Id,
    string PatientId,
    string MeasureName,
    string Status,
    string? DueDate,
    string IdentifiedAt);

public sealed record PopHealthStatsDto(
    int HighRiskPatients,
    int TotalPatients,
    int OpenCareGaps,
    int ClosedCareGaps);

public sealed record SdohAssessmentDto(
    string Id,
    string PatientId,
    int TotalScore,
    string RiskLevel,
    double CompositeRiskWeight,
    string[] PrioritizedNeeds,
    string[] RecommendedActions,
    string AssessedAt);

public sealed record CostPredictionDto(
    string PatientId,
    decimal Predicted12mCostUsd,
    decimal LowerBound95Usd,
    decimal UpperBound95Usd,
    string CostTier,
    string[] CostDrivers,
    string PredictedAt);

public sealed record DrugInteractionDto(
    string AlertLevel,
    bool HasContraindication,
    bool HasMajorInteraction,
    int InteractionCount,
    DetectedInteractionDto[] Interactions);

public sealed record DetectedInteractionDto(
    string DrugA,
    string DrugB,
    string Severity,
    string ClinicalEffect,
    string Management);

public sealed record TriageSessionDto(
    string Id,
    string PatientId,
    string Status,
    string? UrgencyLevel,
    string? TranscriptText,
    string CreatedAt);

public sealed record CodingJobDto(
    string Id,
    string EncounterId,
    string PatientId,
    string PatientName,
    string Status,
    string[]? SuggestedCodes,
    string CreatedAt);

public sealed record PriorAuthDto(
    string Id,
    string PatientId,
    string Procedure,
    string Status,
    string CreatedAt);

public sealed record AppointmentDto(
    string Id,
    string PatientId,
    string ProviderId,
    string AppointmentType,
    string Status,
    string ScheduledAt);

public sealed record EncounterDto(
    string Id,
    string PatientId,
    string? PatientName,
    string Status,
    string EncounterType,
    string? PractitionerId,
    string? PractitionerName,
    string? ReasonCode,
    string? ReasonText,
    string? WorkflowId,
    string StartedAt,
    string? EndedAt);

public sealed record VoiceSessionDto(
    string Id,
    string PatientId,
    string Status,
    string? TranscriptText,
    string CreatedAt,
    string? EndedAt);

public sealed record SoapNoteDto(
    string SessionId,
    string PatientId,
    string Subjective,
    string Objective,
    string Assessment,
    string Plan,
    string GeneratedAt);

public sealed record MlConfidenceDto(
    double Probability,
    ConfidenceIntervalDto ConfidenceInterval);

public sealed record ConfidenceIntervalDto(
    double ConfidenceLevel,
    string DecisionConfidence,
    double LowerBound95,
    double UpperBound95,
    string Method,
    string Interpretation);

// ── Dashboard aggregation DTOs ────────────────────────────────────────────────

public sealed record AgentStatsDto(
    int PendingTriage,
    int AwaitingReview,
    int Completed);

public sealed record SchedulingStatsDto(
    int AvailableToday,
    int BookedToday);

public sealed record RevenueStatsDto(
    int CodingQueue,
    int PriorAuthsPending);

/// <summary>
/// Aggregated dashboard statistics returned by a single GraphQL query,
/// replacing the four individual REST calls previously made by the shell.
/// </summary>
public sealed record DashboardStatsDto(
    AgentStatsDto Agents,
    SchedulingStatsDto Scheduling,
    PopHealthStatsDto PopulationHealth,
    RevenueStatsDto Revenue);

// ── JSON helpers ─────────────────────────────────────────────────────────────

file static class Json
{
    private static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static T? Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Opts);

    public static string Serialize<T>(T value) =>
        JsonSerializer.Serialize(value, Opts);
}

// ── Typed HTTP client wrappers ────────────────────────────────────────────────

/// <summary>Wraps the Population Health microservice REST API.</summary>
public sealed class PopHealthApiClient(HttpClient http)
{
    public async Task<List<PatientRiskDto>> GetRisksAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/population-health/risks", ct);
        return Json.Deserialize<List<PatientRiskDto>>(json) ?? [];
    }

    public async Task<PatientRiskDto?> GetRiskByPatientAsync(string patientId, CancellationToken ct = default)
    {
        var json = await http.GetStringAsync($"/api/v1/population-health/risks/{patientId}", ct);
        return Json.Deserialize<PatientRiskDto>(json);
    }

    public async Task<List<CareGapDto>> GetCareGapsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/population-health/care-gaps", ct);
        return Json.Deserialize<List<CareGapDto>>(json) ?? [];
    }

    public async Task<PopHealthStatsDto?> GetStatsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/population-health/stats", ct);
        return Json.Deserialize<PopHealthStatsDto>(json);
    }

    public async Task<SdohAssessmentDto?> GetSdohAsync(string patientId, CancellationToken ct = default)
    {
        var json = await http.GetStringAsync($"/api/v1/population-health/sdoh/{patientId}", ct);
        return Json.Deserialize<SdohAssessmentDto>(json);
    }

    public async Task<CostPredictionDto?> GetCostPredictionAsync(string patientId, CancellationToken ct = default)
    {
        var json = await http.GetStringAsync($"/api/v1/population-health/cost-prediction/{patientId}", ct);
        return Json.Deserialize<CostPredictionDto>(json);
    }

    public async Task<SdohAssessmentDto?> ScoreSdohAsync(object payload, CancellationToken ct = default)
    {
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/population-health/sdoh", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<SdohAssessmentDto>(json);
    }

    public async Task<CostPredictionDto?> PredictCostAsync(object payload, CancellationToken ct = default)
    {
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/population-health/cost-prediction", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<CostPredictionDto>(json);
    }

    public async Task<DrugInteractionDto?> CheckDrugInteractionsAsync(IEnumerable<string> drugs, CancellationToken ct = default)
    {
        var payload = new { drugs };
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/population-health/drug-interactions/check", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<DrugInteractionDto>(json);
    }
}

/// <summary>Wraps the Agents microservice REST API.</summary>
public sealed class AgentApiClient(HttpClient http)
{
    public async Task<List<TriageSessionDto>> GetTriageSessionsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/agents/triage", ct);
        return Json.Deserialize<List<TriageSessionDto>>(json) ?? [];
    }

    public async Task<AgentStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        try
        {
            var json = await http.GetStringAsync("/api/v1/agents/stats", ct);
            return Json.Deserialize<AgentStatsDto>(json) ?? new AgentStatsDto(0, 0, 0);
        }
        catch { return new AgentStatsDto(0, 0, 0); }
    }

    public async Task<MlConfidenceDto?> GetMlConfidenceAsync(double probability, float[]? features, CancellationToken ct = default)
    {
        var payload = new { probability, featureValues = features };
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/agents/decisions/ml-confidence", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<MlConfidenceDto>(json);
    }

    public async Task<TriageSessionDto?> StartTriageAsync(object payload, CancellationToken ct = default)
    {
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/agents/triage", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<TriageSessionDto>(json);
    }
}

/// <summary>Wraps the Revenue Cycle microservice REST API.</summary>
public sealed class RevenueApiClient(HttpClient http)
{
    public async Task<List<CodingJobDto>> GetCodingJobsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/revenue/coding-jobs", ct);
        return Json.Deserialize<List<CodingJobDto>>(json) ?? [];
    }

    public async Task<List<PriorAuthDto>> GetPriorAuthsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/revenue/prior-auths", ct);
        return Json.Deserialize<List<PriorAuthDto>>(json) ?? [];
    }

    public async Task<RevenueStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        try
        {
            var json = await http.GetStringAsync("/api/v1/revenue/stats", ct);
            return Json.Deserialize<RevenueStatsDto>(json) ?? new RevenueStatsDto(0, 0);
        }
        catch { return new RevenueStatsDto(0, 0); }
    }
}

/// <summary>Wraps the Scheduling microservice REST API.</summary>
public sealed class SchedulingApiClient(HttpClient http)
{
    public async Task<List<AppointmentDto>> GetAppointmentsAsync(CancellationToken ct = default)
    {
        var json = await http.GetStringAsync("/api/v1/scheduling/bookings", ct);
        return Json.Deserialize<List<AppointmentDto>>(json) ?? [];
    }

    public async Task<SchedulingStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        try
        {
            var json = await http.GetStringAsync("/api/v1/scheduling/stats", ct);
            return Json.Deserialize<SchedulingStatsDto>(json) ?? new SchedulingStatsDto(0, 0);
        }
        catch { return new SchedulingStatsDto(0, 0); }
    }

    public async Task<AppointmentDto?> BookAppointmentAsync(object payload, CancellationToken ct = default)
    {
        using var content = new StringContent(Json.Serialize(payload), System.Text.Encoding.UTF8, "application/json");
        var resp = await http.PostAsync("/api/v1/scheduling/bookings", content, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return Json.Deserialize<AppointmentDto>(json);
    }
}

/// <summary>Wraps the FHIR microservice REST API.</summary>
public sealed class FhirApiClient(HttpClient http)
{
    public async Task<JsonElement?> GetPatientAsync(string fhirId, CancellationToken ct = default)
    {
        var json = await http.GetStringAsync($"/api/v1/fhir/patients/{fhirId}", ct);
        return Json.Deserialize<JsonElement>(json);
    }

    public async Task<List<EncounterDto>> GetEncountersAsync(string? patientId, CancellationToken ct = default)
    {
        var url = string.IsNullOrWhiteSpace(patientId)
            ? "/api/v1/fhir/encounters"
            : $"/api/v1/fhir/encounters?patientId={Uri.EscapeDataString(patientId)}";
        var json = await http.GetStringAsync(url, ct);
        return Json.Deserialize<List<EncounterDto>>(json) ?? [];
    }
}

/// <summary>Wraps the Voice microservice REST API.</summary>
public sealed class VoiceApiClient(HttpClient http)
{
    public async Task<List<VoiceSessionDto>> GetSessionsAsync(string? patientId, CancellationToken ct = default)
    {
        var url = string.IsNullOrWhiteSpace(patientId)
            ? "/api/v1/voice/sessions"
            : $"/api/v1/voice/sessions?patientId={Uri.EscapeDataString(patientId)}";
        var json = await http.GetStringAsync(url, ct);
        return Json.Deserialize<List<VoiceSessionDto>>(json) ?? [];
    }

    public async Task<SoapNoteDto?> GetSoapNoteAsync(string sessionId, CancellationToken ct = default)
    {
        var json = await http.GetStringAsync($"/api/v1/voice/sessions/{sessionId}/soap-note", ct);
        return Json.Deserialize<SoapNoteDto>(json);
    }
}
