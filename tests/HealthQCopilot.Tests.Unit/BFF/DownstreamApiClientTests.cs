using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;

using HealthQCopilot.BFF.Services;

namespace HealthQCopilot.Tests.Unit.BFF;

// ── Shared test infrastructure ───────────────────────────────────────────────

/// <summary>
/// Intercepts <see cref="HttpClient"/> calls in-process, returning preset JSON.
/// </summary>
internal sealed class FakeHttpHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;

    public FakeHttpHandler(string responseBody, HttpStatusCode status = HttpStatusCode.OK)
        : this(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
        })
    { }

    public FakeHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        => _respond = respond;

    /// <summary>Stores the last request seen, so tests can assert on the URL/method.</summary>
    public HttpRequestMessage? LastRequest { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        LastRequest = request;
        return Task.FromResult(_respond(request));
    }
}

internal static class FakeClient
{
    public static (TClient Client, FakeHttpHandler Handler) Build<TClient>(
        string responseBody,
        HttpStatusCode status = HttpStatusCode.OK,
        string baseAddress = "http://svc")
        where TClient : class
    {
        var handler = new FakeHttpHandler(responseBody, status);
        var http = new HttpClient(handler) { BaseAddress = new Uri(baseAddress) };
        var client = (TClient)Activator.CreateInstance(typeof(TClient), http)!;
        return (client, handler);
    }
}

// ── PopHealthApiClient ────────────────────────────────────────────────────────

public sealed class PopHealthApiClientTests
{
    private const string RisksJson = """
        [{"id":"r1","patientId":"p1","level":"High","riskScore":0.91,"conditions":["DM"],"assessedAt":"2025-01-01"}]
        """;

    [Fact]
    public async Task GetRisksAsync_DeserializesListCorrectly()
    {
        var (client, _) = FakeClient.Build<PopHealthApiClient>(RisksJson);

        var result = await client.GetRisksAsync(TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].PatientId.Should().Be("p1");
        result[0].Level.Should().Be("High");
    }

    [Fact]
    public async Task GetRisksAsync_ReturnsEmptyListWhenResponseIsNull()
    {
        var (client, _) = FakeClient.Build<PopHealthApiClient>("null");

        var result = await client.GetRisksAsync(TestContext.Current.CancellationToken);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetRiskByPatientAsync_CallsCorrectUrl()
    {
        const string json = """{"id":"r2","patientId":"p42","level":"Low","riskScore":0.1,"conditions":[],"assessedAt":"2025-01-02"}""";
        var (client, handler) = FakeClient.Build<PopHealthApiClient>(json);

        var result = await client.GetRiskByPatientAsync("p42", TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Contain("p42");
        result!.PatientId.Should().Be("p42");
    }

    [Fact]
    public async Task GetStatsAsync_DeserializesStatsDto()
    {
        const string json = """{"highRiskPatients":10,"totalPatients":200,"openCareGaps":55,"closedCareGaps":130}""";
        var (client, _) = FakeClient.Build<PopHealthApiClient>(json);

        var result = await client.GetStatsAsync(TestContext.Current.CancellationToken);

        result.Should().NotBeNull();
        result!.HighRiskPatients.Should().Be(10);
        result.TotalPatients.Should().Be(200);
    }

    [Fact]
    public async Task GetCareGapsAsync_DeserializesListCorrectly()
    {
        const string json = """[{"id":"g1","patientId":"p1","measureName":"A1c","status":"Open","dueDate":null,"identifiedAt":"2025-01-01"}]""";
        var (client, _) = FakeClient.Build<PopHealthApiClient>(json);

        var result = await client.GetCareGapsAsync(TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].MeasureName.Should().Be("A1c");
    }

    [Fact]
    public async Task ScoreSdohAsync_PostsToCorrectEndpointAndDeserializesResponse()
    {
        const string json = """{"id":"s1","patientId":"p1","totalScore":25,"riskLevel":"High","compositeRiskWeight":0.9,"prioritizedNeeds":[],"recommendedActions":[],"assessedAt":"2025-01-01"}""";
        var (client, handler) = FakeClient.Build<PopHealthApiClient>(json);

        var result = await client.ScoreSdohAsync(new { patientId = "p1" }, TestContext.Current.CancellationToken);

        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
        handler.LastRequest.RequestUri!.PathAndQuery.Should().Contain("sdoh");
        result!.PatientId.Should().Be("p1");
        result.TotalScore.Should().Be(25);
    }
}

// ── AgentApiClient ────────────────────────────────────────────────────────────

public sealed class AgentApiClientTests
{
    [Fact]
    public async Task GetTriageSessionsAsync_DeserializesListCorrectly()
    {
        const string json = """[{"id":"t1","patientId":"p1","status":"Pending","urgencyLevel":"High","transcriptText":null,"createdAt":"2025-01-01"}]""";
        var (client, _) = FakeClient.Build<AgentApiClient>(json);

        var result = await client.GetTriageSessionsAsync(TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].Status.Should().Be("Pending");
    }

    [Fact]
    public async Task GetStatsAsync_SwallowsExceptionAndReturnsZeroDefaults()
    {
        // Invalid JSON causes JsonException → swallowed by bare catch{}
        var (client, _) = FakeClient.Build<AgentApiClient>("not-valid-json");

        var result = await client.GetStatsAsync(TestContext.Current.CancellationToken);

        result.Should().BeEquivalentTo(new AgentStatsDto(0, 0, 0));
    }
}

// ── RevenueApiClient ──────────────────────────────────────────────────────────

public sealed class RevenueApiClientTests
{
    [Fact]
    public async Task GetCodingJobsAsync_DeserializesListCorrectly()
    {
        const string json = """[{"id":"j1","encounterId":"e1","patientId":"p1","patientName":"Alice","status":"Pending","suggestedCodes":["Z00.00"],"createdAt":"2025-01-01"}]""";
        var (client, _) = FakeClient.Build<RevenueApiClient>(json);

        var result = await client.GetCodingJobsAsync(TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].PatientName.Should().Be("Alice");
    }

    [Fact]
    public async Task GetStatsAsync_SwallowsExceptionAndReturnsZeroDefaults()
    {
        var (client, _) = FakeClient.Build<RevenueApiClient>("not-valid-json");

        var result = await client.GetStatsAsync(TestContext.Current.CancellationToken);

        result.Should().BeEquivalentTo(new RevenueStatsDto(0, 0));
    }
}

// ── SchedulingApiClient ───────────────────────────────────────────────────────

public sealed class SchedulingApiClientTests
{
    [Fact]
    public async Task GetAppointmentsAsync_DeserializesListCorrectly()
    {
        const string json = """[{"id":"a1","patientId":"p1","providerId":"dr1","appointmentType":"Checkup","status":"Booked","scheduledAt":"2025-01-01T09:00:00Z"}]""";
        var (client, _) = FakeClient.Build<SchedulingApiClient>(json);

        var result = await client.GetAppointmentsAsync(TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].AppointmentType.Should().Be("Checkup");
    }

    [Fact]
    public async Task GetStatsAsync_SwallowsExceptionAndReturnsZeroDefaults()
    {
        var (client, _) = FakeClient.Build<SchedulingApiClient>("not-valid-json");

        var result = await client.GetStatsAsync(TestContext.Current.CancellationToken);

        result.Should().BeEquivalentTo(new SchedulingStatsDto(0, 0));
    }
}

// ── FhirApiClient ─────────────────────────────────────────────────────────────

public sealed class FhirApiClientTests
{
    private const string EncountersJson = """[{"id":"enc1","patientId":"p1","patientName":"Alice","status":"Finished","encounterType":"Outpatient","practitionerId":null,"practitionerName":null,"reasonCode":null,"reasonText":null,"workflowId":null,"startedAt":"2025-01-01","endedAt":null}]""";

    [Fact]
    public async Task GetEncountersAsync_WithoutPatientId_HitsBaseUrl()
    {
        var (client, handler) = FakeClient.Build<FhirApiClient>(EncountersJson);

        await client.GetEncountersAsync(null, TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/api/v1/fhir/encounters");
    }

    [Fact]
    public async Task GetEncountersAsync_WithPatientId_AppendsQueryParameter()
    {
        var (client, handler) = FakeClient.Build<FhirApiClient>(EncountersJson);

        await client.GetEncountersAsync("patient-99", TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.Query.Should().Contain("patientId=patient-99");
    }

    [Fact]
    public async Task GetEncountersAsync_DeserializesEncounterDtos()
    {
        var (client, _) = FakeClient.Build<FhirApiClient>(EncountersJson);

        var result = await client.GetEncountersAsync(null, TestContext.Current.CancellationToken);

        result.Should().HaveCount(1);
        result[0].Id.Should().Be("enc1");
        result[0].Status.Should().Be("Finished");
    }
}

// ── VoiceApiClient ────────────────────────────────────────────────────────────

public sealed class VoiceApiClientTests
{
    private const string SessionsJson = """[{"id":"v1","patientId":"p1","status":"Completed","transcriptText":"Hello","createdAt":"2025-01-01","endedAt":null}]""";

    [Fact]
    public async Task GetSessionsAsync_WithoutPatientId_HitsBaseUrl()
    {
        var (client, handler) = FakeClient.Build<VoiceApiClient>(SessionsJson);

        await client.GetSessionsAsync(null, TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/api/v1/voice/sessions");
    }

    [Fact]
    public async Task GetSessionsAsync_WithPatientId_AppendsQueryParameter()
    {
        var (client, handler) = FakeClient.Build<VoiceApiClient>(SessionsJson);

        await client.GetSessionsAsync("p-007", TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.Query.Should().Contain("patientId=p-007");
    }

    [Fact]
    public async Task GetSoapNoteAsync_DeserializesSoapNoteDto()
    {
        const string json = """{"sessionId":"v1","patientId":"p1","subjective":"S","objective":"O","assessment":"A","plan":"P","generatedAt":"2025-01-01"}""";
        var (client, handler) = FakeClient.Build<VoiceApiClient>(json);

        var result = await client.GetSoapNoteAsync("v1", TestContext.Current.CancellationToken);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Contain("v1");
        result!.Subjective.Should().Be("S");
        result.Plan.Should().Be("P");
    }
}
