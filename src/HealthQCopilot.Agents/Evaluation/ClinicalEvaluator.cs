using System.Text.Json;
using HealthQCopilot.Domain.Agents.Contracts;
using HealthQCopilot.Infrastructure.AI;
using Microsoft.Extensions.Options;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Evaluation;

/// <summary>
/// W3.1 — Clinical accuracy harness. Loads a curated golden case set per suite
/// (triage | coding | care-gap), drives the configured <see cref="IChatCompletionService"/>
/// through each case, and scores correctness via expected-substring containment.
///
/// Designed to run from CI (<c>agent-eval.yml</c>) and from a scheduled
/// background sampler in production. Storage / dataset versioning is delegated
/// to the loader so the harness stays storage-agnostic.
/// </summary>
public sealed class ClinicalEvaluator(
    IClinicalCaseLoader loader,
    IChatCompletionService chat,
    IGroundednessJudge groundednessJudge,
    IToxicityScreener toxicityScreener,
    IOptions<ClinicalEvalOptions> options,
    ILogger<ClinicalEvaluator> logger) : IClinicalEvaluator
{
    private readonly ClinicalEvalOptions _opts = options.Value;

    public async Task<EvalReport> EvaluateAsync(string suite, CancellationToken ct = default)
    {
        var cases = await loader.LoadAsync(suite, ct);
        var results = new List<EvalCaseResult>(cases.Count);
        var settings = new OpenAIPromptExecutionSettings
        {
            MaxTokens = _opts.MaxTokens,
            Temperature = _opts.Temperature,
        };

        foreach (var c in cases)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var history = new ChatHistory();
                if (!string.IsNullOrWhiteSpace(c.SystemPrompt)) history.AddSystemMessage(c.SystemPrompt);
                history.AddUserMessage(c.Input);

                var response = await chat.GetChatMessageContentAsync(history, settings, kernel: null, ct);
                var actual = response.Content ?? string.Empty;
                var (casePassed, reason) = Score(c, actual);

                // W3.2 — groundedness scored only when RAG context is provided.
                double? groundedness = null;
                if (c.Context is { Count: > 0 })
                {
                    try
                    {
                        groundedness = await groundednessJudge.JudgeAsync(actual, c.Context, ct);
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "ClinicalEvaluator: groundedness judge failed for {CaseId}", c.CaseId);
                    }
                }

                // W3.3 — toxicity screen on every produced answer; never fails the case (records metric + audit only).
                ToxicityResult? toxicity = null;
                try
                {
                    toxicity = await toxicityScreener.ScreenAsync(actual, ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "ClinicalEvaluator: toxicity screen failed for {CaseId}", c.CaseId);
                }

                results.Add(new EvalCaseResult(
                    CaseId: c.CaseId,
                    Category: c.Category,
                    Passed: casePassed,
                    Expected: c.ExpectedContains is { Count: > 0 } ? string.Join(" | ", c.ExpectedContains) : null,
                    Actual: Truncate(actual, 512),
                    Confidence: groundedness,
                    FailureReason: casePassed ? null : reason,
                    ToxicitySeverity: toxicity?.MaxSeverity));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ClinicalEvaluator: case {CaseId} threw", c.CaseId);
                results.Add(new EvalCaseResult(c.CaseId, c.Category, false, null, null, null, $"exception: {ex.GetType().Name}"));
            }
        }

        var passed = results.Count(r => r.Passed);
        var total = results.Count;
        var accuracy = total == 0 ? 0d : (double)passed / total;

        // W3.2 — mean groundedness across cases that produced a score.
        var scored = results.Where(r => r.Confidence.HasValue).Select(r => r.Confidence!.Value).ToList();
        var groundednessAvg = scored.Count == 0 ? 0d : scored.Average();

        // W3.3 — mean normalized toxicity severity across screened cases (lower is better).
        var toxScored = results.Where(r => r.ToxicitySeverity.HasValue).Select(r => r.ToxicitySeverity!.Value).ToList();
        var toxicityAvg = toxScored.Count == 0 ? 0d : toxScored.Average();

        return new EvalReport(
            Suite: suite,
            ModelId: _opts.ModelId,
            PromptId: _opts.PromptId,
            PromptVersion: _opts.PromptVersion,
            RunAt: DateTimeOffset.UtcNow,
            TotalCases: total,
            Passed: passed,
            Failed: total - passed,
            AccuracyScore: accuracy,
            GroundednessScore: groundednessAvg,
            ToxicityScore: toxicityAvg,
            Cases: results);
    }

    private static (bool Passed, string? Reason) Score(ClinicalEvalCase c, string actual)
    {
        if (c.MustNotContain is { Count: > 0 })
        {
            foreach (var forbidden in c.MustNotContain)
            {
                if (actual.Contains(forbidden, StringComparison.OrdinalIgnoreCase))
                    return (false, $"contained forbidden phrase: '{forbidden}'");
            }
        }

        if (c.ExpectedContains is { Count: > 0 })
        {
            foreach (var phrase in c.ExpectedContains)
            {
                if (!actual.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                    return (false, $"missing expected phrase: '{phrase}'");
            }
        }

        return (true, null);
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "...";
}

/// <summary>Loader abstraction so golden sets can come from disk, blob, or App Configuration.</summary>
public interface IClinicalCaseLoader
{
    Task<IReadOnlyList<ClinicalEvalCase>> LoadAsync(string suite, CancellationToken ct = default);
}

public sealed record ClinicalEvalCase(
    string CaseId,
    string Category,
    string? SystemPrompt,
    string Input,
    IReadOnlyList<string>? ExpectedContains,
    IReadOnlyList<string>? MustNotContain,
    IReadOnlyList<string>? Context = null);

public sealed class ClinicalEvalOptions
{
    public const string SectionName = "ClinicalEval";
    public string GoldenSetDirectory { get; set; } = "Evaluation/golden-sets";
    public string ModelId { get; set; } = "gpt-4o";
    public string PromptId { get; set; } = "default";
    public string PromptVersion { get; set; } = "v1";
    public int MaxTokens { get; set; } = 512;
    public double Temperature { get; set; } = 0.1;
}

/// <summary>File-based loader: reads <c>{GoldenSetDirectory}/{suite}.json</c> as an array of <see cref="ClinicalEvalCase"/>.</summary>
public sealed class FileClinicalCaseLoader(IOptions<ClinicalEvalOptions> options, ILogger<FileClinicalCaseLoader> logger)
    : IClinicalCaseLoader
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<IReadOnlyList<ClinicalEvalCase>> LoadAsync(string suite, CancellationToken ct = default)
    {
        var path = Path.Combine(options.Value.GoldenSetDirectory, $"{suite}.json");
        if (!File.Exists(path))
        {
            logger.LogWarning("ClinicalEvaluator golden set missing at {Path} — returning empty", path);
            return Array.Empty<ClinicalEvalCase>();
        }
        await using var stream = File.OpenRead(path);
        var cases = await JsonSerializer.DeserializeAsync<List<ClinicalEvalCase>>(stream, JsonOpts, ct);
        return cases ?? new List<ClinicalEvalCase>();
    }
}
