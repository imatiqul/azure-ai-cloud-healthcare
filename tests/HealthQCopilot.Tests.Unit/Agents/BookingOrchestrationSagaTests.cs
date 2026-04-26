using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HealthQCopilot.Agents.Sagas;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// Unit tests for <see cref="BookingOrchestrationSaga"/>.
/// Uses fake <see cref="HttpMessageHandler"/> delegates to simulate downstream service responses
/// without needing running services or Testcontainers.
/// </summary>
public class BookingOrchestrationSagaTests
{
    private readonly ILogger<BookingOrchestrationSaga> _logger =
        Substitute.For<ILogger<BookingOrchestrationSaga>>();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static IHttpClientFactory BuildFactory(
        string clientName,
        Func<HttpRequestMessage, CancellationToken, HttpResponseMessage> handler)
    {
        var factory = Substitute.For<IHttpClientFactory>();
        factory.CreateClient(clientName)
            .Returns(new HttpClient(new DelegatingHandlerStub(handler))
            {
                BaseAddress = new Uri("http://test-host")
            });
        return factory;
    }

    /// <summary>
    /// Factory that wires named clients to independent per-name handlers.
    /// </summary>
    private static IHttpClientFactory BuildMultiClientFactory(
        Dictionary<string, Func<HttpRequestMessage, CancellationToken, HttpResponseMessage>> handlers)
    {
        var factory = Substitute.For<IHttpClientFactory>();
        foreach (var (name, handler) in handlers)
        {
            factory.CreateClient(name)
                .Returns(new HttpClient(new DelegatingHandlerStub(handler))
                {
                    BaseAddress = new Uri("http://test-host")
                });
        }
        return factory;
    }

    private static BookingOrchestrationSaga BuildSaga(IHttpClientFactory factory) =>
        new(factory, Substitute.For<ILogger<BookingOrchestrationSaga>>());

    private static readonly Guid _bookingId = Guid.NewGuid();
    private static readonly Guid _slotId = Guid.NewGuid();
    private static readonly string _patientId = "patient-001";
    private static readonly string _practId = "dr-smith";
    private static readonly DateTime _apptTime = DateTime.UtcNow.AddDays(1);

    // ── Happy-path tests ──────────────────────────────────────────────────────

    [Fact]
    public async Task ExecuteAsync_AllStepsSucceed_ReturnsSuccess()
    {
        // Arrange
        var factory = BuildMultiClientFactory(new()
        {
            ["scheduling-service"] = (req, _) =>
            {
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                    return Ok();
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/bookings"))
                    return OkJson(new { Id = _bookingId, Status = "Booked" });
                return NotFound();
            },
            ["fhir-service"] = (req, _) =>
                OkJson(new { Id = "Appointment/fhir-123", ResourceType = "Appointment" }),
            ["notification-service"] = (req, _) =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("/campaigns") && req.Method == HttpMethod.Post)
                    return OkJson(new { Id = Guid.NewGuid() });
                return Ok();  // campaign activate
            }
        });

        var saga = BuildSaga(factory);

        // Act
        var result = await saga.ExecuteAsync(Guid.NewGuid(), _patientId, _slotId, _practId, _apptTime);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.BookingId.Should().Be(_bookingId);
        result.FhirAppointmentId.Should().Be("Appointment/fhir-123");
    }

    // ── Compensation tests ────────────────────────────────────────────────────

    [Fact]
    public async Task ExecuteAsync_ReservationFails_ReturnsFailureNeverProceedsToBook()
    {
        // Arrange — reservation returns 409
        var factory = BuildMultiClientFactory(new()
        {
            ["scheduling-service"] = (req, _) =>
                req.RequestUri!.AbsolutePath.Contains("/reserve")
                    ? new HttpResponseMessage(HttpStatusCode.Conflict)
                    : OkJson(new { Id = _bookingId }),
            ["fhir-service"] = (_, _) => OkJson(new { Id = "fhir-123" }),
            ["notification-service"] = (_, _) => Ok()
        });
        var saga = BuildSaga(factory);

        // Act
        var result = await saga.ExecuteAsync(Guid.NewGuid(), _patientId, _slotId, _practId, _apptTime);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.FailedStep.Should().Be(BookingSagaStep.Reserve);
        result.WasCompensated.Should().BeFalse(); // Nothing to compensate yet
    }

    [Fact]
    public async Task ExecuteAsync_BookingFails_CompensatesReservation()
    {
        // Arrange — reserve succeeds, booking returns 500
        var deleteCalled = false;
        var factory = BuildMultiClientFactory(new()
        {
            ["scheduling-service"] = (req, _) =>
            {
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                    return Ok();
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/bookings"))
                    return new HttpResponseMessage(HttpStatusCode.InternalServerError);
                if (req.Method == HttpMethod.Delete && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                {
                    deleteCalled = true;
                    return Ok();
                }
                return NotFound();
            },
            ["fhir-service"] = (_, _) => OkJson(new { Id = "fhir-123" }),
            ["notification-service"] = (_, _) => Ok()
        });
        var saga = BuildSaga(factory);

        // Act
        var result = await saga.ExecuteAsync(Guid.NewGuid(), _patientId, _slotId, _practId, _apptTime);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.FailedStep.Should().Be(BookingSagaStep.Book);
        result.WasCompensated.Should().BeTrue();
        deleteCalled.Should().BeTrue("reservation must be released when booking fails");
    }

    [Fact]
    public async Task ExecuteAsync_FhirFails_CompensatesBookingAndReservation()
    {
        // Arrange — reserve + book succeed, FHIR returns 503
        var bookingCancelled = false;
        var reservationReleased = false;

        var factory = BuildMultiClientFactory(new()
        {
            ["scheduling-service"] = (req, _) =>
            {
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                    return Ok();
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/bookings"))
                    return OkJson(new { Id = _bookingId, Status = "Booked" });
                if (req.Method == HttpMethod.Delete && req.RequestUri!.AbsolutePath.Contains("/bookings"))
                {
                    bookingCancelled = true;
                    return Ok();
                }
                if (req.Method == HttpMethod.Delete && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                {
                    reservationReleased = true;
                    return Ok();
                }
                return NotFound();
            },
            ["fhir-service"] = (_, _) =>
                new HttpResponseMessage(HttpStatusCode.ServiceUnavailable),
            ["notification-service"] = (_, _) => Ok()
        });
        var saga = BuildSaga(factory);

        // Act
        var result = await saga.ExecuteAsync(Guid.NewGuid(), _patientId, _slotId, _practId, _apptTime);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.FailedStep.Should().Be(BookingSagaStep.FhirAppointment);
        result.WasCompensated.Should().BeTrue();
        bookingCancelled.Should().BeTrue("booking must be cancelled when FHIR fails");
        reservationReleased.Should().BeTrue("slot reservation must be released");
    }

    [Fact]
    public async Task ExecuteAsync_NotificationFails_StillReturnsSuccess()
    {
        // Notification is best-effort — failures must not affect booking result
        var factory = BuildMultiClientFactory(new()
        {
            ["scheduling-service"] = (req, _) =>
            {
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/reserve"))
                    return Ok();
                if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath.Contains("/bookings"))
                    return OkJson(new { Id = _bookingId, Status = "Booked" });
                return NotFound();
            },
            ["fhir-service"] = (_, _) =>
                OkJson(new { Id = "fhir-999", ResourceType = "Appointment" }),
            ["notification-service"] = (_, _) =>
                new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        });
        var saga = BuildSaga(factory);

        // Act
        var result = await saga.ExecuteAsync(Guid.NewGuid(), _patientId, _slotId, _practId, _apptTime);

        // Assert — booking succeeded even though notification failed
        result.IsSuccess.Should().BeTrue();
        result.BookingId.Should().Be(_bookingId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static HttpResponseMessage Ok() =>
        new(HttpStatusCode.OK) { Content = new StringContent("{}") };

    private static HttpResponseMessage NotFound() =>
        new(HttpStatusCode.NotFound);

    private static HttpResponseMessage OkJson<T>(T body) =>
        new(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(body)
        };
}

/// <summary>
/// Thin <see cref="HttpMessageHandler"/> wrapper that delegates to a synchronous Func.
/// </summary>
internal sealed class DelegatingHandlerStub(
    Func<HttpRequestMessage, CancellationToken, HttpResponseMessage> handler)
    : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
        => Task.FromResult(handler(request, ct));
}
