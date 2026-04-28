using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;

using HealthQCopilot.BFF.Services;
using HealthQCopilot.BFF.Types;

namespace HealthQCopilot.Tests.Unit.BFF;

/// <summary>
/// Tests for <see cref="QueryType"/> focusing on the parallel-aggregation logic
/// in <see cref="QueryType.GetDashboardStatsAsync"/>, which is the only resolver
/// that contains non-trivial logic (Task.WhenAll fan-out + null fallback).
/// </summary>
public sealed class QueryTypeDashboardTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private static AgentApiClient MakeAgentClient(string json = """{"pendingTriage":3,"awaitingReview":1,"completed":5}""")
    {
        var h = new FakeHttpHandler(json);
        return new AgentApiClient(new HttpClient(h) { BaseAddress = new Uri("http://agents") });
    }

    private static SchedulingApiClient MakeSchedulingClient(string json = """{"availableToday":8,"bookedToday":12}""")
    {
        var h = new FakeHttpHandler(json);
        return new SchedulingApiClient(new HttpClient(h) { BaseAddress = new Uri("http://scheduling") });
    }

    private static PopHealthApiClient MakePopHealthClient(string json = """{"highRiskPatients":20,"totalPatients":400,"openCareGaps":60,"closedCareGaps":200}""")
    {
        var h = new FakeHttpHandler(json);
        return new PopHealthApiClient(new HttpClient(h) { BaseAddress = new Uri("http://pophealth") });
    }

    private static RevenueApiClient MakeRevenueClient(string json = """{"codingQueue":7,"priorAuthsPending":4}""")
    {
        var h = new FakeHttpHandler(json);
        return new RevenueApiClient(new HttpClient(h) { BaseAddress = new Uri("http://revenue") });
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboardStatsAsync_AggregatesAllFourServicesCorrectly()
    {
        var sut = new QueryType();
        var ct = TestContext.Current.CancellationToken;

        var result = await sut.GetDashboardStatsAsync(
            MakeAgentClient(),
            MakeSchedulingClient(),
            MakePopHealthClient(),
            MakeRevenueClient(),
            ct);

        result.Agents.PendingTriage.Should().Be(3);
        result.Agents.AwaitingReview.Should().Be(1);
        result.Scheduling.AvailableToday.Should().Be(8);
        result.Scheduling.BookedToday.Should().Be(12);
        result.PopulationHealth.HighRiskPatients.Should().Be(20);
        result.Revenue.CodingQueue.Should().Be(7);
    }

    [Fact]
    public async Task GetDashboardStatsAsync_WhenPopHealthReturnsNull_FallsBackToZeroStats()
    {
        // PopHealth returns JSON "null" → Deserialize<PopHealthStatsDto?> returns null
        // The implementation: popHealthTask.Result ?? new PopHealthStatsDto(0, 0, 0, 0)
        var sut = new QueryType();
        var ct = TestContext.Current.CancellationToken;

        var result = await sut.GetDashboardStatsAsync(
            MakeAgentClient(),
            MakeSchedulingClient(),
            MakePopHealthClient("null"),   // server returns literal "null"
            MakeRevenueClient(),
            ct);

        result.PopulationHealth.HighRiskPatients.Should().Be(0);
        result.PopulationHealth.TotalPatients.Should().Be(0);
        result.PopulationHealth.OpenCareGaps.Should().Be(0);
        result.PopulationHealth.ClosedCareGaps.Should().Be(0);
    }

    [Fact]
    public async Task GetDashboardStatsAsync_CallsAllFourServicesInParallel()
    {
        // Record which services were actually called
        var called = new List<string>();

        AgentApiClient MakeAgent() { var h = new FakeHttpHandler(req => { lock (called) called.Add("agents"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"pendingTriage":0,"awaitingReview":0,"completed":0}""", Encoding.UTF8, "application/json") }; }); return new AgentApiClient(new HttpClient(h) { BaseAddress = new Uri("http://a") }); }
        SchedulingApiClient MakeScheduling() { var h = new FakeHttpHandler(req => { lock (called) called.Add("scheduling"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"availableToday":0,"bookedToday":0}""", Encoding.UTF8, "application/json") }; }); return new SchedulingApiClient(new HttpClient(h) { BaseAddress = new Uri("http://s") }); }
        PopHealthApiClient MakePopHealth() { var h = new FakeHttpHandler(req => { lock (called) called.Add("pophealth"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"highRiskPatients":0,"totalPatients":0,"openCareGaps":0,"closedCareGaps":0}""", Encoding.UTF8, "application/json") }; }); return new PopHealthApiClient(new HttpClient(h) { BaseAddress = new Uri("http://p") }); }
        RevenueApiClient MakeRevenue() { var h = new FakeHttpHandler(req => { lock (called) called.Add("revenue"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"codingQueue":0,"priorAuthsPending":0}""", Encoding.UTF8, "application/json") }; }); return new RevenueApiClient(new HttpClient(h) { BaseAddress = new Uri("http://r") }); }

        var sut = new QueryType();
        await sut.GetDashboardStatsAsync(MakeAgent(), MakeScheduling(), MakePopHealth(), MakeRevenue(), TestContext.Current.CancellationToken);

        called.Should().BeEquivalentTo(["agents", "scheduling", "pophealth", "revenue"],
            because: "all four downstream services must be called by Task.WhenAll");
    }
}
