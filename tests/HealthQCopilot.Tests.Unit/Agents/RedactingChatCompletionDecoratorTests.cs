using System.Runtime.CompilerServices;
using FluentAssertions;
using HealthQCopilot.Agents.Services.Safety;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W1.2 — kernel-level <see cref="RedactingChatCompletionDecorator"/> tests.
/// Verifies that the decorator transparently redacts ChatHistory in place,
/// rehydrates non-streaming responses, records token usage, and is idempotent
/// across SK auto-invoke iterations.
/// </summary>
public sealed class RedactingChatCompletionDecoratorTests
{
    private readonly IPhiRedactor _redactor = Substitute.For<IPhiRedactor>();
    private readonly ITokenLedger _ledger = Substitute.For<ITokenLedger>();
    private readonly IModelPricing _pricing = Substitute.For<IModelPricing>();
    private readonly IFeatureManager _features = Substitute.For<IFeatureManager>();
    private readonly IAgentTraceRecorder _traceRecorder = Substitute.For<IAgentTraceRecorder>();
    private readonly RecordingChatService _inner = new();

    public RedactingChatCompletionDecoratorTests()
    {
        _features.IsEnabledAsync(HealthQFeatures.PhiRedaction).Returns(true);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(false);
    }

    [Fact]
    public async Task Redacts_history_in_place_before_calling_inner()
    {
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-redact";
        var history = new ChatHistory();
        history.AddUserMessage("Patient: John Smith called.");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        _inner.LastHistory.Should().NotBeNull();
        _inner.LastHistory![0].Content.Should().Be("Patient: <PHI:NAME_1> called.");
        history[0].Content.Should().Be("Patient: <PHI:NAME_1> called.");
    }

    [Fact]
    public async Task Rehydrates_assistant_output_against_session_token_map()
    {
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        _inner.ResponseContent = "I will follow up with <PHI:NAME_1> tomorrow.";
        var sut = CreateSut(returnContent: _inner.ResponseContent);
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-rehydrate";
        var history = new ChatHistory();
        history.AddUserMessage("Patient John Smith reports pain.");

        var responses = await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        responses.Should().HaveCount(1);
        responses[0].Content.Should().Be("I will follow up with John Smith tomorrow.");
    }

    [Fact]
    public async Task Records_token_usage_when_flag_on()
    {
        ConfigureRedactor(token: null, original: null);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(true);
        _inner.PromptTokens = 21;
        _inner.CompletionTokens = 9;
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-tokens";
        kernel.Data["agentName"] = "GuideAgent";
        var history = new ChatHistory();
        history.AddUserMessage("hi");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        await _ledger.Received(1).RecordAsync(
            Arg.Is<TokenUsageRecord>(r =>
                r.SessionId == "s-tokens" &&
                r.AgentName == "GuideAgent" &&
                r.PromptTokens == 21 &&
                r.CompletionTokens == 9 &&
                r.TotalTokens == 30),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Skips_redaction_when_phi_flag_off()
    {
        _features.IsEnabledAsync(HealthQFeatures.PhiRedaction).Returns(false);
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        var history = new ChatHistory();
        history.AddUserMessage("Patient John Smith.");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        await _redactor.DidNotReceive().RedactAsync(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        history[0].Content.Should().Be("Patient John Smith.");
    }

    [Fact]
    public async Task Idempotent_across_repeated_invocations_with_same_session()
    {
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-idem";
        var history = new ChatHistory();
        history.AddUserMessage("Patient: John Smith reports pain.");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);
        var afterFirst = history[0].Content;
        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        history[0].Content.Should().Be(afterFirst);
        // Redactor called once for the original message; the second pass should
        // short-circuit because all known placeholders are present.
        await _redactor.Received(1).RedactAsync(
            Arg.Any<string>(), "s-idem", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Streaming_redacts_input_and_passes_chunks_through()
    {
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        var sut = CreateSut(returnContent: "n/a");
        _inner.StreamingChunks = ["one", "two", "three"];
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-stream";
        var history = new ChatHistory();
        history.AddUserMessage("Patient John Smith.");

        var chunks = new List<string>();
        await foreach (var c in sut.GetStreamingChatMessageContentsAsync(history, kernel: kernel))
        {
            chunks.Add(c.Content ?? string.Empty);
        }

        chunks.Should().Equal("one", "two", "three");
        history[0].Content.Should().Be("Patient <PHI:NAME_1>.");
    }

    [Fact]
    public async Task Records_llm_call_and_redaction_trace_steps_for_w44()
    {
        // W4.4 — gateway must emit hierarchical trace steps so the
        // GET /api/v1/agents/traces/{sessionId} endpoint can return the full
        // redactions+tokens timeline to the frontend Agent Console.
        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(true);
        _inner.PromptTokens = 11;
        _inner.CompletionTokens = 7;
        var sut = CreateSut(returnContent: "noted");
        var kernel = new Kernel();
        kernel.Data["sessionId"] = "s-trace";
        kernel.Data["agentName"] = "TriageOrchestrator";
        var history = new ChatHistory();
        history.AddUserMessage("Patient John Smith reports chest pain.");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        await _traceRecorder.Received(1).RecordStepAsync(
            "s-trace",
            Arg.Is<AgentTraceStep>(s => s.Kind == "redaction" && s.AgentName == "TriageOrchestrator"),
            Arg.Any<CancellationToken>());
        await _traceRecorder.Received(1).RecordStepAsync(
            "s-trace",
            Arg.Is<AgentTraceStep>(s =>
                s.Kind == "llm_call" &&
                s.AgentName == "TriageOrchestrator" &&
                s.Tokens != null &&
                s.Tokens.PromptTokens == 11 &&
                s.Tokens.CompletionTokens == 7),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Skips_trace_recording_when_no_session_context()
    {
        // No sessionId on kernel.Data → ResolveContext returns "anonymous";
        // recorder must not be invoked to avoid polluting the cross-session map.
        ConfigureRedactor(token: null, original: null);
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        var history = new ChatHistory();
        history.AddUserMessage("hi");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        await _traceRecorder.DidNotReceive().RecordStepAsync(
            Arg.Any<string>(), Arg.Any<AgentTraceStep>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetSessionMaskedCount_returns_cumulative_distinct_entities_for_session()
    {
        // W1.5b — TriageOrchestrator reads this at audit-emission time so the
        // AgentDecision audit row carries the full PHI-redaction tally for the
        // session, not just per-call counts. Cumulative across multiple LLM
        // calls (auto-invoke iterations) under the same sessionId.
        var sessionId = $"s-mask-{Guid.NewGuid():n}";

        // Unknown session → 0
        RedactingChatCompletionDecorator.GetSessionMaskedCount(sessionId).Should().Be(0);

        ConfigureRedactor("<PHI:NAME_1>", "John Smith");
        var sut = CreateSut(returnContent: "ok");
        var kernel = new Kernel();
        kernel.Data["sessionId"] = sessionId;
        var history = new ChatHistory();
        history.AddUserMessage("Patient John Smith reports chest pain.");

        await sut.GetChatMessageContentsAsync(history, kernel: kernel);

        // After one call masking one distinct entity → count is 1.
        RedactingChatCompletionDecorator.GetSessionMaskedCount(sessionId).Should().Be(1);
    }

    private RedactingChatCompletionDecorator CreateSut(string returnContent)
    {
        _inner.ResponseContent = returnContent;
        return new RedactingChatCompletionDecorator(
            _inner, _redactor, _ledger, _pricing, _features,
            NullLogger<RedactingChatCompletionDecorator>.Instance,
            _traceRecorder);
    }

    private void ConfigureRedactor(string? token, string? original, string strategy = "regex-fallback")
    {
        _redactor.RedactAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var input = call.ArgAt<string>(0);
                if (token is not null && original is not null && input.Contains(original))
                {
                    var redacted = input.Replace(original, token);
                    var map = new Dictionary<string, string> { [token] = original };
                    var entities = new List<RedactionEntity>
                    {
                        new("PERSON", input.IndexOf(original, StringComparison.Ordinal),
                            input.IndexOf(original, StringComparison.Ordinal) + original.Length, 0.95, token),
                    };
                    return new RedactionResult(redacted, map, entities, strategy, false);
                }
                return new RedactionResult(input, new Dictionary<string, string>(), [], strategy, false);
            });
        _redactor.Rehydrate(Arg.Any<string>(), Arg.Any<IReadOnlyDictionary<string, string>>())
            .Returns(call =>
            {
                var text = call.ArgAt<string>(0);
                var map = call.ArgAt<IReadOnlyDictionary<string, string>>(1);
                foreach (var (k, v) in map) text = text.Replace(k, v);
                return text;
            });
    }

    private sealed class RecordingChatService : IChatCompletionService
    {
        public string ResponseContent { get; set; } = "ok";
        public int PromptTokens { get; set; }
        public int CompletionTokens { get; set; }
        public IReadOnlyList<string> StreamingChunks { get; set; } = ["chunk"];
        public ChatHistory? LastHistory { get; private set; }
        public IReadOnlyDictionary<string, object?> Attributes { get; } = new Dictionary<string, object?>();

        public Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            CancellationToken cancellationToken = default)
        {
            // Snapshot a copy so subsequent decorator-level mutations don't bleed in.
            var snap = new ChatHistory();
            foreach (var m in chatHistory) snap.AddMessage(m.Role, m.Content ?? string.Empty);
            LastHistory = snap;

            var meta = new Dictionary<string, object?>
            {
                ["PromptTokens"] = PromptTokens,
                ["CompletionTokens"] = CompletionTokens,
                ["ModelId"] = "gpt-test",
            };
            var msg = new ChatMessageContent(AuthorRole.Assistant, ResponseContent) { Metadata = meta };
            return Task.FromResult<IReadOnlyList<ChatMessageContent>>([msg]);
        }

        public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var snap = new ChatHistory();
            foreach (var m in chatHistory) snap.AddMessage(m.Role, m.Content ?? string.Empty);
            LastHistory = snap;
            foreach (var c in StreamingChunks)
            {
                yield return new StreamingChatMessageContent(AuthorRole.Assistant, c);
            }
            await Task.CompletedTask;
        }
    }
}
