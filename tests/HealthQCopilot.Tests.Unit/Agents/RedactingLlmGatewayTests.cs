using System.Runtime.CompilerServices;
using FluentAssertions;
using HealthQCopilot.Agents.Services.Safety;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Services;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W1.2 / W4.1 — exercises <see cref="RedactingLlmGateway"/> through a fake
/// <see cref="IChatCompletionService"/> attached to a real Kernel so we can
/// verify (a) PHI redaction runs before the chat call, (b) outputs are
/// re-hydrated, (c) token usage is recorded only when the feature flag is on,
/// and (d) the aggregate strategy mirrors the underlying redactor.
/// </summary>
public sealed class RedactingLlmGatewayTests
{
    private readonly IPhiRedactor _redactor = Substitute.For<IPhiRedactor>();
    private readonly ITokenLedger _ledger = Substitute.For<ITokenLedger>();
    private readonly IModelPricing _pricing = Substitute.For<IModelPricing>();
    private readonly IFeatureManager _features = Substitute.For<IFeatureManager>();

    [Fact]
    public async Task CompleteAsync_redacts_input_and_rehydrates_output()
    {
        var captured = new List<string>();
        ConfigureRedactor(captured, "<PHI:NAME_1>", "John Smith");
        var kernel = BuildKernel(returnContent: "Hello <PHI:NAME_1>");
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("Hi this is John Smith");

        var result = await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        captured.Should().ContainSingle().Which.Should().Be("Hi this is John Smith");
        result.Content.Should().Be("Hello John Smith");
        result.Redaction.Strategy.Should().Be("regex-fallback");
        result.Redaction.Entities.Should().HaveCount(1);
    }

    [Fact]
    public async Task CompleteAsync_records_token_usage_when_flag_is_on()
    {
        ConfigureRedactor([], token: null, original: null);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(true);
        var kernel = BuildKernel(returnContent: "ok", promptTokens: 12, completionTokens: 7);
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("benign");

        await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        await _ledger.Received(1).RecordAsync(
            Arg.Is<TokenUsageRecord>(r =>
                r.SessionId == "s1" &&
                r.AgentName == "TriageAgent" &&
                r.PromptTokens == 12 &&
                r.CompletionTokens == 7 &&
                r.TotalTokens == 19),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CompleteAsync_skips_token_ledger_when_flag_is_off()
    {
        ConfigureRedactor([], token: null, original: null);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(false);
        var kernel = BuildKernel(returnContent: "ok");
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("benign");

        await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        await _ledger.DidNotReceive().RecordAsync(Arg.Any<TokenUsageRecord>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CompleteAsync_propagates_redactor_strategy_into_result()
    {
        ConfigureRedactor([], token: null, original: null, strategy: "presidio");
        var kernel = BuildKernel(returnContent: "ok");
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("benign");

        var result = await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        result.Redaction.Strategy.Should().Be("presidio");
    }

    [Fact]
    public async Task CompleteAsync_extracts_tokens_from_openai_usage_shape()
    {
        // Real OpenAI SDK puts a typed object under "Usage" with InputTokenCount/OutputTokenCount.
        ConfigureRedactor([], token: null, original: null);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(true);
        var usage = new FakeOpenAiUsage(InputTokenCount: 33, OutputTokenCount: 11);
        var kernel = BuildKernelWithUsage(returnContent: "ok", usage);
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("benign");

        var result = await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        result.PromptTokens.Should().Be(33);
        result.CompletionTokens.Should().Be(11);
        await _ledger.Received(1).RecordAsync(
            Arg.Is<TokenUsageRecord>(r => r.PromptTokens == 33 && r.CompletionTokens == 11 && r.TotalTokens == 44),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CompleteAsync_captures_model_version_in_token_record()
    {
        // W4.6 — every audit/trace record carries model_id + model_version.
        ConfigureRedactor([], token: null, original: null);
        _features.IsEnabledAsync(HealthQFeatures.TokenAccounting).Returns(true);
        var usage = new FakeOpenAiUsage(InputTokenCount: 1, OutputTokenCount: 1);
        var kernel = BuildKernelWithUsage(returnContent: "ok", usage);
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("benign");

        await sut.CompleteAsync(history, kernel, "s1", "TriageAgent");

        await _ledger.Received(1).RecordAsync(
            Arg.Is<TokenUsageRecord>(r => r.ModelId == "gpt-test" && r.ModelVersion == "gpt-test-2024-08-06"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CompleteAsync_forwards_settings_overload_to_underlying_chat()
    {
        ConfigureRedactor([], token: null, original: null);
        var spy = new SettingsCapturingChatService();
        var kernel = BuildKernelWithService(spy);
        var sut = CreateSut();

        var history = new ChatHistory();
        history.AddUserMessage("hi");
        var settings = new PromptExecutionSettings { ModelId = "gpt-4o" };

        await sut.CompleteAsync(history, settings, kernel, "s1", "TriageAgent");

        spy.LastSettings.Should().BeSameAs(settings);
    }

    private RedactingLlmGateway CreateSut() => new(
        _redactor, _ledger, _pricing, _features, NullLogger<RedactingLlmGateway>.Instance);

    private void ConfigureRedactor(
        List<string> captured,
        string? token,
        string? original,
        string strategy = "regex-fallback")
    {
        _redactor.RedactAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var input = call.ArgAt<string>(0);
                captured.Add(input);
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

    private static Kernel BuildKernel(string returnContent, int promptTokens = 0, int completionTokens = 0)
    {
        var services = new ServiceCollection();
        services.AddKernel();
        services.AddSingleton<IChatCompletionService>(new FakeChatCompletionService(returnContent, promptTokens, completionTokens));
        var sp = services.BuildServiceProvider();
        return sp.GetRequiredService<Kernel>();
    }

    private static Kernel BuildKernelWithUsage(string returnContent, FakeOpenAiUsage usage)
    {
        var services = new ServiceCollection();
        services.AddKernel();
        services.AddSingleton<IChatCompletionService>(new FakeChatCompletionService(returnContent, 0, 0, usage));
        return services.BuildServiceProvider().GetRequiredService<Kernel>();
    }

    private static Kernel BuildKernelWithService(IChatCompletionService chat)
    {
        var services = new ServiceCollection();
        services.AddKernel();
        services.AddSingleton(chat);
        return services.BuildServiceProvider().GetRequiredService<Kernel>();
    }

    public sealed record FakeOpenAiUsage(int InputTokenCount, int OutputTokenCount);

    private sealed class FakeChatCompletionService(string content, int promptTokens, int completionTokens, FakeOpenAiUsage? usage = null) : IChatCompletionService
    {
        public IReadOnlyDictionary<string, object?> Attributes { get; } = new Dictionary<string, object?>();

        public Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            CancellationToken cancellationToken = default)
        {
            var meta = new Dictionary<string, object?>
            {
                ["PromptTokens"] = promptTokens,
                ["CompletionTokens"] = completionTokens,
                ["ModelId"] = "gpt-test",
                ["ModelVersion"] = "gpt-test-2024-08-06",
            };
            if (usage is not null) meta["Usage"] = usage;
            var msg = new ChatMessageContent(AuthorRole.Assistant, content) { Metadata = meta };
            return Task.FromResult<IReadOnlyList<ChatMessageContent>>([msg]);
        }

        public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            yield return new StreamingChatMessageContent(AuthorRole.Assistant, content);
            await Task.CompletedTask;
        }
    }

    private sealed class SettingsCapturingChatService : IChatCompletionService
    {
        public IReadOnlyDictionary<string, object?> Attributes { get; } = new Dictionary<string, object?>();
        public PromptExecutionSettings? LastSettings { get; private set; }

        public Task<IReadOnlyList<ChatMessageContent>> GetChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            CancellationToken cancellationToken = default)
        {
            LastSettings = executionSettings;
            var msg = new ChatMessageContent(AuthorRole.Assistant, "ok");
            return Task.FromResult<IReadOnlyList<ChatMessageContent>>([msg]);
        }

        public async IAsyncEnumerable<StreamingChatMessageContent> GetStreamingChatMessageContentsAsync(
            ChatHistory chatHistory,
            PromptExecutionSettings? executionSettings = null,
            Kernel? kernel = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            yield return new StreamingChatMessageContent(AuthorRole.Assistant, "ok");
            await Task.CompletedTask;
        }
    }
}
