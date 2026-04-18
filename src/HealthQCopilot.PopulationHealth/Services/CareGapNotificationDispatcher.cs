using System.Net.Http.Json;
using HealthQCopilot.Domain.PopulationHealth;

namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Dispatches HTTP notifications to the Notification service when care gaps are identified or addressed.
/// Calls the Notification service through the APIM gateway (fire-and-forget).
/// </summary>
public sealed class CareGapNotificationDispatcher
{
    private readonly HttpClient _http;
    private readonly ILogger<CareGapNotificationDispatcher> _logger;

    public CareGapNotificationDispatcher(HttpClient http, ILogger<CareGapNotificationDispatcher> logger)
    {
        _http = http;
        _logger = logger;
    }

    /// <summary>
    /// Creates an outreach campaign for an addressed care gap (follow-up reminder).
    /// </summary>
    public async Task DispatchCareGapAddressedAsync(CareGap gap, CancellationToken ct = default)
    {
        try
        {
            if (!Guid.TryParse(gap.PatientId, out var patientGuid))
            {
                _logger.LogWarning("CareGap {CareGapId} has non-GUID PatientId '{PatientId}'; skipping notification",
                    gap.Id, gap.PatientId);
                return;
            }

            var campaign = new
            {
                Name = $"Care Gap Follow-Up: {gap.MeasureId} — {gap.PatientId}",
                Type = 2, // CampaignType.FollowUp
                TargetPatientIds = new[] { patientGuid },
            };

            var res = await _http.PostAsJsonAsync("/api/v1/notifications/campaigns", campaign, ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Notification service returned {Status} for care gap {CareGapId}", res.StatusCode, gap.Id);
                return;
            }

            var created = await res.Content.ReadFromJsonAsync<CampaignResponse>(cancellationToken: ct);
            if (created?.Id is not null)
            {
                await _http.PostAsync($"/api/v1/notifications/campaigns/{created.Id}/activate", null, ct);
                _logger.LogInformation("Care gap notification campaign {CampaignId} created and activated for patient {PatientId}",
                    created.Id, gap.PatientId);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to dispatch care gap notification for gap {CareGapId}", gap.Id);
        }
    }

    /// <summary>
    /// Creates bulk outreach campaigns for a batch of open care gaps (e.g. seeded data).
    /// Groups by patient so each patient receives one consolidated campaign.
    /// </summary>
    public async Task DispatchOpenCareGapCampaignsAsync(IEnumerable<CareGap> gaps, CancellationToken ct = default)
    {
        var byPatient = gaps
            .Where(g => g.Status == CareGapStatus.Open)
            .GroupBy(g => g.PatientId);

        foreach (var group in byPatient)
        {
            try
            {
                if (!Guid.TryParse(group.Key, out var patientGuid))
                {
                    _logger.LogWarning("Skipping care gap campaign for non-GUID PatientId '{PatientId}'", group.Key);
                    continue;
                }

                var measures = string.Join(", ", group.Select(g => g.MeasureId));
                var campaign = new
                {
                    Name = $"Open Care Gaps Outreach — {group.Key}",
                    Type = 1, // CampaignType.CareGap
                    TargetPatientIds = new[] { patientGuid },
                };

                var res = await _http.PostAsJsonAsync("/api/v1/notifications/campaigns", campaign, ct);
                if (res.IsSuccessStatusCode)
                {
                    var created = await res.Content.ReadFromJsonAsync<CampaignResponse>(cancellationToken: ct);
                    if (created?.Id is not null)
                        await _http.PostAsync($"/api/v1/notifications/campaigns/{created.Id}/activate", null, ct);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Failed to dispatch care gap campaign for patient {PatientId}", group.Key);
            }
        }
    }

    private sealed record CampaignResponse(Guid Id);
}
