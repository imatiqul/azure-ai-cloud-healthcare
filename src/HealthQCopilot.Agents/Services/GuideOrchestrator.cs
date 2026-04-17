using System.Text.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Plugins;
using HealthQCopilot.Domain.Agents;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace HealthQCopilot.Agents.Services;

public sealed class GuideOrchestrator
{
    private readonly Kernel _kernel;
    private readonly AgentDbContext _db;
    private readonly PlatformGuidePlugin _guidePlugin;
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

    public GuideOrchestrator(Kernel kernel, AgentDbContext db, PlatformGuidePlugin guidePlugin, ILogger<GuideOrchestrator> logger)
    {
        _kernel = kernel;
        _db = db;
        _guidePlugin = guidePlugin;
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
        await _db.SaveChangesAsync(ct);

        return new GuideResponse(sessionId, assistantReply, DetectSuggestedRoute(assistantReply));
    }

    private async Task<string> ChatWithLlmAsync(GuideConversation conversation, string userMessage, CancellationToken ct)
    {
        try
        {
            var chatService = _kernel.GetRequiredService<IChatCompletionService>();
            var history = new ChatHistory(SystemPrompt);

            // Add conversation context (last 20 messages to stay within token limits)
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

            var result = await chatService.GetChatMessageContentAsync(history, settings, _kernel, ct);
            return result.Content ?? "I'm here to help. Could you rephrase your question?";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LLM chat failed, falling back to rules");
            return await ChatWithRulesAsync(userMessage, ct);
        }
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
}

public record GuideResponse(Guid SessionId, string Message, string? SuggestedRoute);
