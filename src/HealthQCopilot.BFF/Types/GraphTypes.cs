using HotChocolate.Execution;
using HotChocolate.Subscriptions;
using HealthQCopilot.BFF.DataLoaders;
using HealthQCopilot.BFF.Services;

namespace HealthQCopilot.BFF.Types;

// ── Query ────────────────────────────────────────────────────────────────────

/// <summary>
/// Root query type. Each field delegates to a typed downstream HTTP client.
/// DataLoaders are injected where N+1 prevention is required.
/// </summary>
public sealed class QueryType
{
    // ── Population Health ──────────────────────────────────────────────────

    [GraphQLDescription("All patient risk assessments (latest per patient).")]
    public Task<List<PatientRiskDto>> GetPatientRisksAsync(
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => popHealth.GetRisksAsync(ct);

    [GraphQLDescription("Risk assessment for a specific patient.")]
    public Task<PatientRiskDto?> GetPatientRiskAsync(
        string patientId,
        PatientRiskDataLoader loader,
        CancellationToken ct)
        => loader.LoadAsync(patientId, ct);

    [GraphQLDescription("Open care gaps across the patient population.")]
    public Task<List<CareGapDto>> GetCareGapsAsync(
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => popHealth.GetCareGapsAsync(ct);

    [GraphQLDescription("Care gaps for a specific patient (batched).")]
    public Task<List<CareGapDto>> GetPatientCareGapsAsync(
        string patientId,
        CareGapDataLoader loader,
        CancellationToken ct)
        => loader.LoadAsync(patientId, ct)!;

    [GraphQLDescription("Aggregated population health statistics.")]
    public Task<PopHealthStatsDto?> GetPopHealthStatsAsync(
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => popHealth.GetStatsAsync(ct);

    [GraphQLDescription("Latest SDOH assessment for a patient.")]
    public Task<SdohAssessmentDto?> GetSdohAssessmentAsync(
        string patientId,
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => popHealth.GetSdohAsync(patientId, ct);

    [GraphQLDescription("Latest 12-month cost prediction for a patient.")]
    public Task<CostPredictionDto?> GetCostPredictionAsync(
        string patientId,
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => popHealth.GetCostPredictionAsync(patientId, ct);

    // ── Agents ─────────────────────────────────────────────────────────────

    [GraphQLDescription("List recent triage sessions.")]
    public Task<List<TriageSessionDto>> GetTriageSessionsAsync(
        AgentApiClient agents,
        CancellationToken ct)
        => agents.GetTriageSessionsAsync(ct);

    // ── Revenue Cycle ──────────────────────────────────────────────────────

    [GraphQLDescription("List clinical coding jobs.")]
    public Task<List<CodingJobDto>> GetCodingJobsAsync(
        RevenueApiClient revenue,
        CancellationToken ct)
        => revenue.GetCodingJobsAsync(ct);

    [GraphQLDescription("List prior authorization requests.")]
    public Task<List<PriorAuthDto>> GetPriorAuthsAsync(
        RevenueApiClient revenue,
        CancellationToken ct)
        => revenue.GetPriorAuthsAsync(ct);

    // ── Scheduling ─────────────────────────────────────────────────────────

    [GraphQLDescription("List scheduled appointments.")]
    public Task<List<AppointmentDto>> GetAppointmentsAsync(
        SchedulingApiClient scheduling,
        CancellationToken ct)
        => scheduling.GetAppointmentsAsync(ct);
}

// ── Mutation ─────────────────────────────────────────────────────────────────

/// <summary>
/// Root mutation type. Write operations that touch downstream microservices and
/// may publish events to GraphQL subscriptions.
/// </summary>
public sealed class MutationType
{
    [GraphQLDescription("Score a patient's SDOH domains and persist the assessment.")]
    public async Task<SdohAssessmentDto> ScoreSdohAsync(
        SdohInput input,
        PopHealthApiClient popHealth,
        ITopicEventSender eventSender,
        CancellationToken ct)
    {
        var payload = new
        {
            patientId = input.PatientId,
            domainScores = input.DomainScores,
            assessedBy = input.AssessedBy,
            notes = input.Notes,
        };
        var result = await popHealth.ScoreSdohAsync(payload, ct)
            ?? throw new GraphQLException("SDOH scoring returned no result.");

        // Notify any active subscriptions
        await eventSender.SendAsync(
            $"SDOH_{input.PatientId}", result, ct);

        return result;
    }

    [GraphQLDescription("Predict 12-month cost for a patient and persist the result.")]
    public async Task<CostPredictionDto> PredictCostAsync(
        CostPredictionInput input,
        PopHealthApiClient popHealth,
        CancellationToken ct)
    {
        var payload = new
        {
            patientId = input.PatientId,
            riskLevel = input.RiskLevel,
            conditions = input.Conditions,
            sdohWeight = input.SdohWeight,
        };
        return await popHealth.PredictCostAsync(payload, ct)
            ?? throw new GraphQLException("Cost prediction returned no result.");
    }

    [GraphQLDescription("Check a list of drugs for clinically significant interactions.")]
    public async Task<DrugInteractionDto> CheckDrugInteractionsAsync(
        IEnumerable<string> drugs,
        PopHealthApiClient popHealth,
        CancellationToken ct)
        => await popHealth.CheckDrugInteractionsAsync(drugs, ct)
            ?? throw new GraphQLException("Drug interaction check returned no result.");

    [GraphQLDescription("Compute 95% confidence interval around an ML readmission risk score.")]
    public async Task<MlConfidenceDto> ComputeMlConfidenceAsync(
        double probability,
        float[]? featureValues,
        AgentApiClient agents,
        CancellationToken ct)
        => await agents.GetMlConfidenceAsync(probability, featureValues, ct)
            ?? throw new GraphQLException("ML confidence computation returned no result.");
}

// ── Subscription ─────────────────────────────────────────────────────────────

/// <summary>
/// Root subscription type. Clients can subscribe over WebSocket to receive
/// real-time updates without polling the REST endpoints.
/// </summary>
public sealed class SubscriptionType
{
    /// <summary>
    /// Fires whenever a new SDOH assessment is scored for the given patient.
    /// Frontend components can subscribe and automatically re-render without
    /// issuing repeated GET /sdoh/{patientId} polls.
    /// </summary>
    [Subscribe(With = nameof(SubscribeToSdohUpdated))]
    [GraphQLDescription("Subscribe to SDOH assessment updates for a specific patient.")]
    public SdohAssessmentDto OnSdohUpdated(
        [EventMessage] SdohAssessmentDto assessment)
        => assessment;

    public static ValueTask<ISourceStream<SdohAssessmentDto>> SubscribeToSdohUpdated(
        string patientId,
        [Service] ITopicEventReceiver receiver,
        CancellationToken ct)
        => receiver.SubscribeAsync<SdohAssessmentDto>($"SDOH_{patientId}", ct);

    /// <summary>
    /// Fires whenever a new clinical coding job reaches "Approved" status.
    /// Revenue Cycle MFE components update their list view without polling.
    /// </summary>
    [Subscribe(With = nameof(SubscribeToCodingJobApproved))]
    [GraphQLDescription("Subscribe to coding job status changes.")]
    public CodingJobDto OnCodingJobApproved(
        [EventMessage] CodingJobDto job)
        => job;

    public static ValueTask<ISourceStream<CodingJobDto>> SubscribeToCodingJobApproved(
        [Service] ITopicEventReceiver receiver,
        CancellationToken ct)
        => receiver.SubscribeAsync<CodingJobDto>("CODING_JOB_APPROVED", ct);
}

// ── Input types ───────────────────────────────────────────────────────────────

public sealed record SdohInput(
    string PatientId,
    Dictionary<string, int> DomainScores,
    string? AssessedBy = null,
    string? Notes = null);

public sealed record CostPredictionInput(
    string PatientId,
    string RiskLevel,
    string[] Conditions,
    double SdohWeight = 0);
