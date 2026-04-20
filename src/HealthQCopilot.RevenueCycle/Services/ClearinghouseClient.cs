using HealthQCopilot.Domain.RevenueCycle;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace HealthQCopilot.RevenueCycle.Services;

/// <summary>
/// Client for submitting EDI 837 claims to a clearinghouse and retrieving
/// acknowledgement/status responses.
///
/// Supported clearinghouses: Change Healthcare (Optum), Availity, and any
/// REST-capable clearinghouse with the same contract. The client sends the
/// EDI document as <c>text/plain</c> and expects a JSON acknowledgement.
///
/// In the absence of a real clearinghouse connection (dev / staging), the
/// client operates in <em>simulation mode</em> and returns a synthetic ACK.
/// </summary>
public class ClearinghouseClient(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<ClearinghouseClient> logger)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <summary>
    /// Submits a single 837P EDI document to the configured clearinghouse.
    /// Returns a <see cref="ClearinghouseSubmissionResult"/> with the assigned
    /// claim control number and acceptance status.
    /// </summary>
    public async Task<ClearinghouseSubmissionResult> SubmitAsync(
        ClaimSubmission claim,
        string ediDocument,
        CancellationToken ct = default)
    {
        var baseUrl = configuration["Clearinghouse:BaseUrl"];

        // ── Simulation mode (no clearinghouse configured) ─────────────────────
        if (string.IsNullOrEmpty(baseUrl))
        {
            logger.LogWarning(
                "Clearinghouse:BaseUrl not configured — operating in simulation mode for claim {ClaimId}",
                claim.Id);

            // Synthetic 999 TA1 acknowledgement — accepted
            return new ClearinghouseSubmissionResult(
                Accepted: true,
                ClearinghouseClaimId: $"SIM-{claim.InterchangeControlNumber}",
                RawResponse: "{\"status\":\"accepted\",\"simulated\":true}",
                RejectionReason: null);
        }

        // ── Production submission ─────────────────────────────────────────────
        try
        {
            using var httpClient = httpClientFactory.CreateClient("Clearinghouse");
            var submitPath = configuration["Clearinghouse:SubmitPath"] ?? "/v1/claims/837";

            var request = new HttpRequestMessage(HttpMethod.Post, baseUrl.TrimEnd('/') + submitPath)
            {
                Content = new StringContent(ediDocument, Encoding.UTF8, "text/plain")
            };

            // API key authentication (Change Healthcare / Availity pattern)
            var apiKey = configuration["Clearinghouse:ApiKey"];
            if (!string.IsNullOrEmpty(apiKey))
                request.Headers.Add("x-api-key", apiKey);

            var clientId = configuration["Clearinghouse:ClientId"];
            var clientSecret = configuration["Clearinghouse:ClientSecret"];
            if (!string.IsNullOrEmpty(clientId) && !string.IsNullOrEmpty(clientSecret))
            {
                var credentials = Convert.ToBase64String(
                    Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
                request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
            }

            using var response = await httpClient.SendAsync(request, ct);
            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogError(
                    "Clearinghouse rejected claim {ClaimId}: HTTP {Status} — {Body}",
                    claim.Id, (int)response.StatusCode, body);

                return new ClearinghouseSubmissionResult(
                    Accepted: false,
                    ClearinghouseClaimId: null,
                    RawResponse: body,
                    RejectionReason: $"HTTP {(int)response.StatusCode}: {body[..Math.Min(256, body.Length)]}");
            }

            // Parse JSON acknowledgement (clearinghouse-specific schema)
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            var ackClaimId =
                root.TryGetProperty("claimId", out var cidProp) ? cidProp.GetString() :
                root.TryGetProperty("controlNumber", out var cnProp) ? cnProp.GetString() :
                $"ACK-{claim.InterchangeControlNumber}";

            var accepted =
                !root.TryGetProperty("status", out var statusProp) ||
                statusProp.GetString() is not ("rejected" or "error");

            var rejectionReason = accepted ? null :
                root.TryGetProperty("message", out var msgProp) ? msgProp.GetString() : "Rejected by clearinghouse";

            logger.LogInformation(
                "Clearinghouse submission {Result} for claim {ClaimId} — CH claim id: {ChId}",
                accepted ? "accepted" : "rejected", claim.Id, ackClaimId);

            return new ClearinghouseSubmissionResult(accepted, ackClaimId, body, rejectionReason);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Clearinghouse submission failed for claim {ClaimId}", claim.Id);
            throw;
        }
    }
}

/// <param name="Accepted">True if the clearinghouse accepted the interchange (TA1/999 accepted).</param>
/// <param name="ClearinghouseClaimId">Clearinghouse-assigned claim identifier for tracking.</param>
/// <param name="RawResponse">Raw JSON/EDI response body for audit purposes.</param>
/// <param name="RejectionReason">Human-readable rejection reason when <see cref="Accepted"/> is false.</param>
public sealed record ClearinghouseSubmissionResult(
    bool Accepted,
    string? ClearinghouseClaimId,
    string RawResponse,
    string? RejectionReason);
