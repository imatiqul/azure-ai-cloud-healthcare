using System.Diagnostics;
using System.Text.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Agents.Rag;
using HealthQCopilot.Domain.Agents;
using HealthQCopilot.Infrastructure.AI;
using HealthQCopilot.ServiceDefaults.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.FeatureManagement;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Services;

public sealed class GuideOrchestrator
{
    private readonly Kernel _kernel;
    private readonly AgentDbContext _db;
    private readonly PlatformGuidePlugin _guidePlugin;
    private readonly IRagContextProvider? _rag;
    private readonly ILlmUsageTracker _usageTracker;
    private readonly IPromptRegistry _promptRegistry;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IFeatureManager _features;
    private readonly IPhiRedactor _phiRedactor;
    private readonly ILogger<GuideOrchestrator> _logger;
    private readonly bool _hasLlm;

    private const string SystemPrompt = """
        You are HealthQ Copilot, an AI clinical workflow assistant for a healthcare platform.
        You guide healthcare professionals through the end-to-end clinical workflow:
        Voice Intake → AI Triage → Scheduling → Medical Coding → Prior Authorization → Population Health Monitoring.

        You have access to real-time platform data through your tools. Use them to answer questions with actual numbers.
        When users ask about a workflow step, use guide_workflow_step to provide detailed instructions.
        When users ask about data, query the relevant service (triage, scheduling, population health, revenue).

        Be concise, professional, and action-oriented. Use markdown formatting.
        Always suggest the next logical step in the workflow when appropriate.
        If the user seems lost, offer the platform overview.
        Never make up data — always use your tools to fetch real information.
        """;

    public GuideOrchestrator(
        Kernel kernel,
        AgentDbContext db,
        PlatformGuidePlugin guidePlugin,
        ILlmUsageTracker usageTracker,
        IPromptRegistry promptRegistry,
        IHttpContextAccessor httpContextAccessor,
        IFeatureManager features,
        IPhiRedactor phiRedactor,
        ILogger<GuideOrchestrator> logger,
        IRagContextProvider? rag = null)
    {
        _kernel = kernel;
        _db = db;
        _guidePlugin = guidePlugin;
        _usageTracker = usageTracker;
        _promptRegistry = promptRegistry;
        _httpContextAccessor = httpContextAccessor;
        _features = features;
        _phiRedactor = phiRedactor;
        _rag = rag;
        _logger = logger;
        _hasLlm = kernel.GetAllServices<IChatCompletionService>().Any();
    }

    public async Task<GuideResponse> ChatAsync(Guid sessionId, string userMessage, CancellationToken ct)
    {
        // Load or create conversation
        var conversation = await _db.GuideConversations
            .Include(c => c.Messages)
            .FirstOrDefaultAsync(c => c.Id == sessionId, ct);

        if (conversation is null)
        {
            conversation = GuideConversation.Create(sessionId);
            _db.GuideConversations.Add(conversation);
        }

        conversation.AddMessage("user", userMessage);
        _db.GuideMessages.Add(conversation.Messages[^1]);

        string assistantReply;
        if (_hasLlm)
        {
            assistantReply = await ChatWithLlmAsync(conversation, userMessage, ct);
        }
        else
        {
            assistantReply = await ChatWithRulesAsync(userMessage, ct);
        }

        conversation.AddMessage("assistant", assistantReply);
        _db.GuideMessages.Add(conversation.Messages[^1]);
        await _db.SaveChangesAsync(ct);

        return new GuideResponse(sessionId, assistantReply, DetectSuggestedRoute(assistantReply));
    }

    private async Task<string> ChatWithLlmAsync(GuideConversation conversation, string userMessage, CancellationToken ct)
    {
        try
        {
            var chatService = _kernel.GetRequiredService<IChatCompletionService>();

            // Retrieve relevant clinical context from Qdrant (RAG)
            var ragContext = _rag is not null
                ? await _rag.GetRelevantContextAsync(userMessage, topK: 4, ct: ct)
                : string.Empty;

            // Resolve effective system prompt — supports per-tenant overrides via App Configuration
            var tenantId = _httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault()
                ?? _httpContextAccessor.HttpContext?.User?.FindFirst("tid")?.Value
                ?? "default";
            var basePrompt = await _promptRegistry.GetPromptAsync("guide-system", tenantId, SystemPrompt, ct);

            var effectiveSystemPrompt = string.IsNullOrEmpty(ragContext)
                ? basePrompt
                : basePrompt + Environment.NewLine + Environment.NewLine + ragContext;

            var history = new ChatHistory(effectiveSystemPrompt);

            // W1.2 — PHI redaction guard: mask any user-authored content before
            // it leaves the process for Azure OpenAI. Assistant messages are
            // already redaction-safe because they were generated from masked input.
            var redactPhi = await _features.IsEnabledAsync(HealthQFeatures.PhiRedaction);

            // Add conversation context (last 20 messages to stay within token limits)
            foreach (var msg in conversation.Messages.OrderBy(m => m.Timestamp).TakeLast(20))
            {
                if (msg.Role == "user")
                {
                    var content = msg.Content;
                    if (redactPhi)
                    {
                        var r = await _phiRedactor.RedactAsync(content, conversation.Id.ToString(), ct);
                        content = r.RedactedText;
                    }
                    history.AddUserMessage(content);
                }
                else if (msg.Role == "assistant")
                {
                    history.AddAssistantMessage(msg.Content);
                }
            }

            var settings = new OpenAIPromptExecutionSettings
            {
                ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
                MaxTokens = 1024,
                Temperature = 0.3
            };

            var sw = Stopwatch.StartNew();
            var result = await chatService.GetChatMessageContentAsync(history, settings, _kernel, ct);
            sw.Stop();

            // Track token usage for cost attribution per tenant
            var (promptTokens, completionTokens) = ExtractTokenUsage(result);
            _usageTracker.TrackUsage(promptTokens, completionTokens, "GuideAgent", tenantId, sw.Elapsed.TotalMilliseconds);

            return result.Content ?? "I'm here to help. Could you rephrase your question?";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LLM chat failed, falling back to rules");
            return await ChatWithRulesAsync(userMessage, ct);
        }
    }

    /// <summary>
    /// Extracts prompt and completion token counts from SK ChatMessageContent metadata.
    /// Uses reflection to avoid a hard compile-time dependency on the OpenAI SDK type.
    /// Returns (0, 0) gracefully when metadata is absent (e.g., streaming / mock LLM).
    /// </summary>
    private static (int PromptTokens, int CompletionTokens) ExtractTokenUsage(ChatMessageContent? msg)
    {
        if (msg?.Metadata?.TryGetValue("Usage", out var usageObj) != true || usageObj is null)
            return (0, 0);

        var t = usageObj.GetType();
        var input = t.GetProperty("InputTokenCount")?.GetValue(usageObj) as int? ?? 0;
        var output = t.GetProperty("OutputTokenCount")?.GetValue(usageObj) as int? ?? 0;
        return (input, output);
    }

    private async Task<string> ChatWithRulesAsync(string userMessage, CancellationToken ct)
    {
        var lower = userMessage.ToLowerInvariant();

        // Greeting / help
        if (ContainsAny(lower, "hello", "hi ", "hey", "help", "start", "what can you", "who are you"))
        {
            return """
                👋 **Welcome to HealthQ Copilot!** I'm your AI clinical workflow assistant.

                I can help you with:
                - **Navigate the platform** — "Show me the workflow" or "What should I do next?"
                - **Check status** — "How many triage cases are pending?" or "Show available slots"
                - **Guide you step-by-step** — "Guide me through intake" or "Help with coding"
                - **Get real-time data** — "Show high-risk patients" or "Revenue stats"

                What would you like to do?
                """;
        }

        // Platform overview
        if (ContainsAny(lower, "overview", "platform", "modules", "what is this", "features", "workflow"))
        {
            return _guidePlugin.GetPlatformOverview();
        }

        // Workflow guidance
        if (ContainsAny(lower, "intake", "voice", "record", "session", "transcri"))
            return _guidePlugin.GuideWorkflowStep("intake");

        if (ContainsAny(lower, "triage", "urgency", "priority", "p1", "p2", "escalat"))
        {
            if (ContainsAny(lower, "status", "how many", "pending", "count", "stats"))
            {
                return await _guidePlugin.GetTriageStatusAsync();
            }
            if (ContainsAny(lower, "recent", "cases", "list", "show"))
            {
                return await _guidePlugin.GetRecentTriageCasesAsync();
            }
            return _guidePlugin.GuideWorkflowStep("triage");
        }

        if (ContainsAny(lower, "schedul", "appointment", "slot", "book", "calendar"))
        {
            if (ContainsAny(lower, "status", "how many", "available", "stats", "today"))
            {
                return await _guidePlugin.GetSchedulingStatusAsync();
            }
            return _guidePlugin.GuideWorkflowStep("scheduling");
        }

        if (ContainsAny(lower, "coding", "icd", "claim", "code review"))
        {
            if (ContainsAny(lower, "queue", "pending", "list", "show"))
            {
                return await _guidePlugin.GetCodingQueueAsync();
            }
            return _guidePlugin.GuideWorkflowStep("coding");
        }

        if (ContainsAny(lower, "prior auth", "authorization", "insurance", "payer", "denial"))
        {
            if (ContainsAny(lower, "list", "show", "status", "track"))
            {
                return await _guidePlugin.GetPriorAuthsAsync();
            }
            return _guidePlugin.GuideWorkflowStep("prior-auth");
        }

        if (ContainsAny(lower, "population", "risk", "care gap", "high risk", "critical patient"))
        {
            if (ContainsAny(lower, "high risk", "critical", "patient list"))
            {
                return await _guidePlugin.GetHighRiskPatientsAsync();
            }
            if (ContainsAny(lower, "status", "stats", "overview", "how many"))
            {
                return await _guidePlugin.GetPopulationHealthStatusAsync();
            }
            return _guidePlugin.GuideWorkflowStep("monitoring");
        }

        if (ContainsAny(lower, "revenue", "billing", "financial"))
        {
            return await _guidePlugin.GetRevenueStatusAsync();
        }

        // Dashboard / stats
        if (ContainsAny(lower, "dashboard", "summary", "stats", "numbers", "metrics"))
        {
            var tasks = new[]
            {
                _guidePlugin.GetTriageStatusAsync(),
                _guidePlugin.GetSchedulingStatusAsync(),
                _guidePlugin.GetPopulationHealthStatusAsync(),
                _guidePlugin.GetRevenueStatusAsync()
            };
            var results = await Task.WhenAll(tasks);
            return $"""
                📊 **Platform Summary**

                {results[0]}
                {results[1]}
                {results[2]}
                {results[3]}

                Navigate to the **Dashboard** (/) for real-time visual metrics.
                """;
        }

        // Next step
        if (ContainsAny(lower, "next", "what now", "then what", "after"))
        {
            return """
                To guide you to the next step, tell me where you are in the workflow:
                1. **Just started** → Begin with Voice Intake (/voice)
                2. **Finished intake** → Check AI Triage (/triage)
                3. **Triage complete** → Schedule an appointment (/scheduling)
                4. **Appointment done** → Review coding (/revenue)
                5. **Codes approved** → Submit prior auth (/revenue)
                6. **All done** → Monitor outcomes (/population-health)

                Which step are you at?
                """;
        }

        // Fallback
        return """
            I'm not sure I understood that. I can help with:
            - **"Show me the workflow"** — See the end-to-end clinical process
            - **"Guide me through [step]"** — Detailed guidance for any step
            - **"Show triage/scheduling/revenue stats"** — Real-time data
            - **"What should I do next?"** — Workflow navigation

            Try one of these, or ask me anything about the platform!
            """;
    }

    private static string? DetectSuggestedRoute(string reply)
    {
        if (reply.Contains("(/voice)")) return "/voice";
        if (reply.Contains("(/triage)")) return "/triage";
        if (reply.Contains("(/scheduling)")) return "/scheduling";
        if (reply.Contains("(/revenue)")) return "/revenue";
        if (reply.Contains("(/population-health)")) return "/population-health";
        if (reply.Contains("(/)")) return "/";
        return null;
    }

    private static bool ContainsAny(string text, params string[] keywords) =>
        keywords.Any(text.Contains);

    /// <summary>
    /// Streams the guide response token-by-token using Azure OpenAI streaming.
    /// Falls back to the non-streaming path if the LLM is unavailable.
    /// Callers write each yielded string as an SSE `data:` line.
    /// The final item is always a JSON object: {"done":true,"suggestedRoute":"..."}.
    /// </summary>
    public async IAsyncEnumerable<string> StreamChatAsync(
        Guid sessionId,
        string userMessage,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        // Load or create conversation
        var conversation = await _db.GuideConversations
            .Include(c => c.Messages)
            .FirstOrDefaultAsync(c => c.Id == sessionId, ct);

        if (conversation is null)
        {
            conversation = GuideConversation.Create(sessionId);
            _db.GuideConversations.Add(conversation);
        }

        conversation.AddMessage("user", userMessage);
        _db.GuideMessages.Add(conversation.Messages[^1]);
        await _db.SaveChangesAsync(ct);

        if (!_hasLlm)
        {
            // Non-LLM path: yield entire response as one token
            var fallbackReply = await ChatWithRulesAsync(userMessage, ct);
            conversation.AddMessage("assistant", fallbackReply);
            _db.GuideMessages.Add(conversation.Messages[^1]);
            await _db.SaveChangesAsync(ct);
            yield return fallbackReply;
            yield return $"{{\"done\":true,\"suggestedRoute\":{System.Text.Json.JsonSerializer.Serialize(DetectSuggestedRoute(fallbackReply))}}}";
            yield break;
        }

        // Streaming LLM path.
        // C# iterators cannot yield inside try-catch, so we stream tokens into a
        // Channel and read from it in the yield section below.
        var assembled = new System.Text.StringBuilder();
        var channel = System.Threading.Channels.Channel.CreateUnbounded<string>(
            new System.Threading.Channels.UnboundedChannelOptions { SingleReader = true });

        _ = Task.Run(async () =>
        {
            try
            {
                var chatService = _kernel.GetRequiredService<IChatCompletionService>();

                var ragContext = _rag is not null
                    ? await _rag.GetRelevantContextAsync(userMessage, topK: 4, ct: ct)
                    : string.Empty;

                var effectiveSystemPrompt = string.IsNullOrEmpty(ragContext)
                    ? SystemPrompt
                    : SystemPrompt + Environment.NewLine + Environment.NewLine + ragContext;

                var history = new ChatHistory(effectiveSystemPrompt);
                foreach (var msg in conversation.Messages.OrderBy(m => m.Timestamp).TakeLast(20))
                {
                    if (msg.Role == "user") history.AddUserMessage(msg.Content);
                    else if (msg.Role == "assistant") history.AddAssistantMessage(msg.Content);
                }

                var settings = new OpenAIPromptExecutionSettings
                {
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
                    MaxTokens = 1024,
                    Temperature = 0.3
                };

                await foreach (var chunk in chatService.GetStreamingChatMessageContentsAsync(
                    history, settings, _kernel, ct))
                {
                    var token = chunk.Content ?? string.Empty;
                    if (!string.IsNullOrEmpty(token))
                        await channel.Writer.WriteAsync(token, ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Streaming LLM chat failed for session {SessionId}, falling back", sessionId);
                var fallback = await ChatWithRulesAsync(userMessage, ct);
                await channel.Writer.WriteAsync(fallback, ct);
            }
            finally
            {
                channel.Writer.Complete();
            }
        }, ct);

        await foreach (var token in channel.Reader.ReadAllAsync(ct))
        {
            assembled.Append(token);
            yield return token;
        }

        var fullReply = assembled.ToString();
        conversation.AddMessage("assistant", fullReply);
        _db.GuideMessages.Add(conversation.Messages[^1]);
        await _db.SaveChangesAsync(ct);

        yield return $"{{\"done\":true,\"suggestedRoute\":{System.Text.Json.JsonSerializer.Serialize(DetectSuggestedRoute(fullReply))}}}";
    }
}

public record GuideResponse(Guid SessionId, string Message, string? SuggestedRoute);
