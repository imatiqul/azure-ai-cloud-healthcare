using Dapr;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace HealthQCopilot.Fhir.Controllers;

[ApiController]
public class FhirSubscriberController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<FhirSubscriberController> _logger;

    public FhirSubscriberController(IHttpClientFactory httpClientFactory,
        ILogger<FhirSubscriberController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// When a slot is booked, create a FHIR Appointment resource on the FHIR server.
    /// </summary>
    [Topic("pubsub", "scheduling.slot.booked")]
    [HttpPost("/dapr/sub/fhir-slot-booked")]
    public async Task<IActionResult> HandleSlotBooked(
        [FromBody] FhirSlotBookedEvent payload,
        CancellationToken ct)
    {
        _logger.LogInformation("Creating FHIR Appointment for booking {BookingId}", payload.BookingId);

        var fhirAppointment = new
        {
            resourceType = "Appointment",
            status = "booked",
            description = $"Auto-scheduled appointment (booking {payload.BookingId})",
            start = payload.AppointmentTime.ToString("o"),
            end = payload.AppointmentTime.AddMinutes(30).ToString("o"),
            participant = new[]
            {
                new
                {
                    actor = new { reference = $"Patient/{payload.PatientId}", display = payload.PatientId },
                    required = "required",
                    status = "accepted"
                },
                new
                {
                    actor = new { reference = $"Practitioner/{payload.PractitionerId}", display = payload.PractitionerId },
                    required = "required",
                    status = "accepted"
                }
            }
        };

        try
        {
            var client = _httpClientFactory.CreateClient("FhirServer");
            var json = JsonSerializer.Serialize(fhirAppointment);
            var content = new StringContent(json, Encoding.UTF8, "application/fhir+json");
            var response = await client.PostAsync("Appointment", content, ct);

            if (response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogInformation("FHIR Appointment created for booking {BookingId}: {Response}",
                    payload.BookingId, responseBody[..Math.Min(200, responseBody.Length)]);
            }
            else
            {
                _logger.LogWarning("FHIR server returned {Status} when creating Appointment for booking {BookingId}",
                    response.StatusCode, payload.BookingId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create FHIR Appointment for booking {BookingId}", payload.BookingId);
            // Don't return error — let Dapr acknowledge so we don't get stuck retrying
        }

        return Ok();
    }
}

public record FhirSlotBookedEvent(Guid BookingId, Guid SlotId, string PatientId, string PractitionerId, DateTime AppointmentTime);
