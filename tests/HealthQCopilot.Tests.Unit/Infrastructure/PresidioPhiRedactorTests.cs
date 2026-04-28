using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W1.1 — verifies the Presidio-backed redactor masks entities returned by
/// the analyzer sidecar, produces a reversible token map, and falls back to
/// the regex implementation when the sidecar is unreachable.
/// </summary>
public sealed class PresidioPhiRedactorTests
{
    private readonly RegexPhiRedactor _fallback = new(NullLogger<RegexPhiRedactor>.Instance);
    private readonly PresidioOptions _options = new()
    {
        AnalyzerEndpoint = "http://presidio:5001",
        TimeoutMs = 2000,
        MinScore = 0.5,
        Entities = ["PERSON", "PHONE_NUMBER"],
    };

    [Fact]
    public async Task RedactAsync_masks_entities_returned_by_analyzer()
    {
        const string input = "Patient John Smith called from 555-867-5309 today.";
        var analyzerResponse = new[]
        {
            new { entity_type = "PERSON",       start = 8,  end = 18, score = 0.98 },
            new { entity_type = "PHONE_NUMBER", start = 31, end = 43, score = 0.95 },
        };
        var sut = CreateSut(StubHandler.JsonOk(analyzerResponse));

        var result = await sut.RedactAsync(input, sessionId: "s1");

        result.Strategy.Should().Be("presidio");
        result.RedactedText.Should().NotContain("John Smith")
            .And.NotContain("555-867-5309");
        result.Entities.Should().HaveCount(2);
        result.TokenMap.Should().HaveCount(2);
    }

    [Fact]
    public async Task Rehydrate_restores_original_values()
    {
        const string input = "Patient John Smith called from 555-867-5309 today.";
        var analyzerResponse = new[]
        {
            new { entity_type = "PERSON",       start = 8,  end = 18, score = 0.98 },
            new { entity_type = "PHONE_NUMBER", start = 31, end = 43, score = 0.95 },
        };
        var sut = CreateSut(StubHandler.JsonOk(analyzerResponse));
        var result = await sut.RedactAsync(input, sessionId: "s1");

        var rehydrated = sut.Rehydrate(result.RedactedText, result.TokenMap);

        rehydrated.Should().Be(input);
    }

    [Fact]
    public async Task RedactAsync_falls_back_to_regex_when_analyzer_fails()
    {
        const string input = "SSN 123-45-6789 was leaked.";
        var sut = CreateSut(StubHandler.AlwaysThrows());

        var result = await sut.RedactAsync(input, sessionId: "s1");

        result.Strategy.Should().Be("regex-fallback");
        result.RedactedText.Should().NotContain("123-45-6789");
        result.Entities.Should().NotBeEmpty();
    }

    [Fact]
    public async Task RedactAsync_drops_entities_below_min_score_threshold()
    {
        const string input = "Maybe John was here.";
        var analyzerResponse = new[]
        {
            new { entity_type = "PERSON", start = 6, end = 10, score = 0.30 }, // below 0.5
        };
        var sut = CreateSut(StubHandler.JsonOk(analyzerResponse));

        var result = await sut.RedactAsync(input, sessionId: "s1");

        result.Strategy.Should().Be("presidio");
        result.RedactedText.Should().Be(input);
        result.Entities.Should().BeEmpty();
    }

    [Fact]
    public async Task RedactAsync_returns_unchanged_input_when_input_is_empty()
    {
        var sut = CreateSut(StubHandler.AlwaysThrows()); // never called
        var result = await sut.RedactAsync(string.Empty, sessionId: "s1");

        result.RedactedText.Should().BeEmpty();
        result.Strategy.Should().Be("presidio");
        result.Entities.Should().BeEmpty();
    }

    private PresidioPhiRedactor CreateSut(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri(_options.AnalyzerEndpoint + "/") };
        return new PresidioPhiRedactor(http, Options.Create(_options), _fallback,
            NullLogger<PresidioPhiRedactor>.Instance);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(responder(request));

        public static StubHandler JsonOk(object body) => new(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(body),
        });

        public static StubHandler AlwaysThrows() => new(_ => throw new HttpRequestException("sidecar down"));
    }
}
