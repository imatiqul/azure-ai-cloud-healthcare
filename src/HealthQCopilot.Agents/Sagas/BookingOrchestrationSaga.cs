using System.Net.Http.Json;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Agents.Sagas;

/// <summary>
/// Saga orchestrator for the appointment booking flow.
///
/// Coordinates a distributed transaction that spans:
///   1. Slot reservation  (Scheduling Service)
///   2. Slot booking       (Scheduling Service)
///   3. FHIR Appointment   (FHIR Service)
///   4. Notification       (Notification Service)
///
/// Each step has a compensating action. If any step fails after a prior step
/// succeeded, compensation runs in reverse order so the system converges
/// back to a consistent state.
///
/// Callers receive a <see cref="BookingResult"/> that captures whether
/// compensation was triggered and which step failed.
/// </summary>
public sealed class BookingOrchestrationSaga(
    IHttpClientFactory httpFactory,
    ILogger<BookingOrchestrationSaga> logger)
{
    // ── Public API ──────────────────────────────────────────────────────────────

    public async Task<BookingResult> ExecuteAsync(
        Guid workflowId,
        string patientId,
        Guid slotId,
        string practitionerId,
        DateTime appointmentTime,
        CancellationToken ct = default)
    {
        using var http = httpFactory.CreateClient("scheduling-service");

        // ── Step 1: Reserve the slot ─────────────────────────────────────────
        var reserved = await ReserveSlotAsync(http, slotId, patientId, ct);
        if (!reserved.IsSuccess)
            return BookingResult.Failure(BookingSagaStep.Reserve, reserved.Error ?? "Slot reservation failed", compensated: false);

        // ── Step 2: Book (confirm) the reserved slot ─────────────────────────
        var bookingId = await BookSlotAsync(http, slotId, patientId, practitionerId, appointmentTime, ct);
        if (bookingId is null)
        {
            // Compensate: release the reservation
            await CompensateReservationAsync(http, slotId, ct);
            return BookingResult.Failure(BookingSagaStep.Book, "Booking creation failed", compensated: true);
        }

        // ── Step 3: Create FHIR Appointment ──────────────────────────────────
        var fhirId = await CreateFhirAppointmentAsync(patientId, practitionerId, appointmentTime, bookingId.Value, ct);
        if (fhirId is null)
        {
            // Compensate: cancel the booking + release reservation
            await CompensateBookingAsync(http, bookingId.Value, ct);
            await CompensateReservationAsync(http, slotId, ct);
            return BookingResult.Failure(BookingSagaStep.FhirAppointment, "FHIR appointment creation failed", compensated: true);
        }

        // ── Step 4: Notify patient (best-effort — does not trigger compensation) ──
        await NotifyPatientAsync(patientId, bookingId.Value, appointmentTime, practitionerId, ct);

        logger.LogInformation(
            "BookingOrchestrationSaga completed: WorkflowId={WorkflowId} BookingId={BookingId} FhirId={FhirId}",
            workflowId, bookingId, fhirId);

        return BookingResult.Success(bookingId.Value, fhirId);
    }

    // ── Step implementations ────────────────────────────────────────────────────

    private async Task<Result> ReserveSlotAsync(
        HttpClient http, Guid slotId, string patientId, CancellationToken ct)
    {
        try
        {
            var resp = await http.PostAsJsonAsync(
                $"/api/v1/scheduling/slots/{slotId}/reserve",
                new { PatientId = patientId },
                ct);

            if (resp.IsSuccessStatusCode) return Result.Success();

            var body = await resp.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Slot reservation failed: SlotId={SlotId} Status={Status} Body={Body}",
                slotId, resp.StatusCode, body);
            return Result.Failure($"Slot reservation returned {(int)resp.StatusCode}");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Slot reservation threw: SlotId={SlotId}", slotId);
            return Result.Failure("Slot reservation threw an exception");
        }
    }

    private async Task<Guid?> BookSlotAsync(
        HttpClient http, Guid slotId, string patientId,
        string practitionerId, DateTime appointmentTime, CancellationToken ct)
    {
        try
        {
            var resp = await http.PostAsJsonAsync(
                "/api/v1/scheduling/bookings",
                new { SlotId = slotId, PatientId = patientId, PractitionerId = practitionerId, AppointmentTime = appointmentTime },
                ct);

            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("Booking creation failed: SlotId={SlotId} Status={Status}", slotId, resp.StatusCode);
                return null;
            }

            var result = await resp.Content.ReadFromJsonAsync<BookingCreatedDto>(cancellationToken: ct);
            return result?.Id;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Booking creation threw: SlotId={SlotId}", slotId);
            return null;
        }
    }

    private async Task<string?> CreateFhirAppointmentAsync(
        string patientId, string practitionerId, DateTime appointmentTime,
        Guid bookingId, CancellationToken ct)
    {
        try
        {
            using var fhirHttp = httpFactory.CreateClient("fhir-service");
            var payload = new
            {
                resourceType = "Appointment",
                status = "booked",
                start = appointmentTime.ToString("o"),
                end = appointmentTime.AddMinutes(30).ToString("o"),
                participant = new[]
                {
                    new { actor = new { reference = $"Patient/{patientId}" }, status = "accepted" },
                    new { actor = new { reference = $"Practitioner/{practitionerId}" }, status = "accepted" }
                },
                extension = new[]
                {
                    new { url = "http://healthq.ai/fhir/ext/booking-id", valueString = bookingId.ToString() }
                }
            };

            var resp = await fhirHttp.PostAsJsonAsync("/api/v1/fhir/appointments", payload, ct);
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("FHIR appointment creation failed: BookingId={BookingId} Status={Status}",
                    bookingId, resp.StatusCode);
                return null;
            }

            var fhir = await resp.Content.ReadFromJsonAsync<FhirCreatedDto>(cancellationToken: ct);
            return fhir?.Id;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "FHIR appointment creation threw: BookingId={BookingId}", bookingId);
            return null;
        }
    }

    private async Task NotifyPatientAsync(
        string patientId, Guid bookingId, DateTime appointmentTime,
        string practitionerId, CancellationToken ct)
    {
        try
        {
            using var notifHttp = httpFactory.CreateClient("notification-service");
            var campaignResp = await notifHttp.PostAsJsonAsync(
                "/api/v1/notifications/campaigns",
                new
                {
                    Name = $"Booking confirmation {bookingId.ToString()[..8]}",
                    Type = 3,   // AppointmentConfirmation enum value
                    TargetPatientIds = new[] { patientId },
                    Metadata = new { BookingId = bookingId, AppointmentTime = appointmentTime, PractitionerId = practitionerId }
                },
                ct);

            if (!campaignResp.IsSuccessStatusCode) return;
            var campaign = await campaignResp.Content.ReadFromJsonAsync<CampaignDto>(cancellationToken: ct);
            if (campaign?.Id is null) return;

            await notifHttp.PostAsync($"/api/v1/notifications/campaigns/{campaign.Id}/activate", null, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Best-effort — notification failure never unwinds the booking
            logger.LogWarning(ex, "Patient notification failed (non-fatal): PatientId={PatientId} BookingId={BookingId}",
                patientId, bookingId);
        }
    }

    // ── Compensating actions ────────────────────────────────────────────────────

    private async Task CompensateReservationAsync(HttpClient http, Guid slotId, CancellationToken ct)
    {
        try
        {
            await http.DeleteAsync($"/api/v1/scheduling/slots/{slotId}/reserve", ct);
            logger.LogInformation("Compensation: slot reservation released for SlotId={SlotId}", slotId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Compensation failed: could not release slot reservation SlotId={SlotId}", slotId);
        }
    }

    private async Task CompensateBookingAsync(HttpClient http, Guid bookingId, CancellationToken ct)
    {
        try
        {
            await http.DeleteAsync($"/api/v1/scheduling/bookings/{bookingId}", ct);
            logger.LogInformation("Compensation: booking cancelled BookingId={BookingId}", bookingId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Compensation failed: could not cancel booking BookingId={BookingId}", bookingId);
        }
    }

    // ── DTOs ────────────────────────────────────────────────────────────────────

    private sealed record BookingCreatedDto(Guid? Id, string? Status);
    private sealed record FhirCreatedDto(string? Id, string? ResourceType);
    private sealed record CampaignDto(Guid? Id);
}

// ── Result types ─────────────────────────────────────────────────────────────

public enum BookingSagaStep { Reserve, Book, FhirAppointment, Notify }

public sealed class BookingResult
{
    public bool IsSuccess { get; private init; }
    public Guid? BookingId { get; private init; }
    public string? FhirAppointmentId { get; private init; }
    public string? Error { get; private init; }
    public BookingSagaStep? FailedStep { get; private init; }
    public bool WasCompensated { get; private init; }

    public static BookingResult Success(Guid bookingId, string fhirId) =>
        new() { IsSuccess = true, BookingId = bookingId, FhirAppointmentId = fhirId };

    public static BookingResult Failure(BookingSagaStep step, string error, bool compensated) =>
        new() { IsSuccess = false, FailedStep = step, Error = error, WasCompensated = compensated };
}
