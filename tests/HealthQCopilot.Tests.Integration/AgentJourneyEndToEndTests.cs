using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HealthQCopilot.Agents.Infrastructure;
using HealthQCopilot.Agents.Services;
using HealthQCopilot.Voice.Infrastructure;
using HealthQCopilot.Tests.Integration.Fixtures;
using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Integration;

/// <summary>
/// P3.1 — End-to-end agent journey test.
///
/// Covers the full happy-path pipeline across both the Voice and Agents services:
///
///   1. Voice session created (POST /api/v1/voice/sessions)
///   2. Synthetic transcript submitted to voice session containing PHI tokens
///      (POST /api/v1/voice/sessions/{id}/transcript)
///   3. Transcript text forwarded to agent triage endpoint — simulating the
///      Dapr transcript.produced pub/sub event that the Agents service handles
///      in production (POST /api/v1/agents/triage)
///   4. Triage result asserted: 201 + valid TriageLevel in body
///   5. Agent trace endpoint consulted to verify the session is known to the
///      recorder (GET /api/v1/agents/traces/{sessionId}) — returns 200 or 404
///      depending on whether the LLM path was exercised; neither is a 500
///   6. Cancel endpoint asserted: always 202
///      (POST /api/v1/agents/sessions/{sessionId}/cancel)
///   7. Clinician feedback submitted for the triage workflow — simulating the UI
///      action that closes the loop (POST /api/v1/agents/feedback)
///
/// Steps 1–2 exercise the Voice service factory.
/// Steps 3–7 exercise the Agents service factory.
/// Both factories share the same Testcontainers Postgres instance so schema
/// isolation is maintained without a second container spin-up cost.
/// </summary>
public class AgentJourneyEndToEndTests : IClassFixture<PostgresFixture>
{
    // Shared PHI-containing transcript used throughout the journey.
    // The text is intentionally realistic so the PHI redactor and the
    // hallucination guard exercise their rule-sets in the Testing environment.
    private const string PhiTranscript =
        "Patient John Doe, DOB 1975-04-12, SSN 123-45-6789 reports acute chest pain " +
        "radiating to the left arm, onset 20 minutes ago. No prior cardiac history.";

    private readonly HttpClient _voiceClient;
    private readonly HttpClient _agentClient;

    public AgentJourneyEndToEndTests(PostgresFixture postgres)
    {
        var voiceFactory = new ServiceWebApplicationFactory<VoiceDbContext, VoiceDbContext>(postgres);
        var agentFactory = new ServiceWebApplicationFactory<TriageOrchestrator, AgentDbContext>(postgres);

        _voiceClient = voiceFactory.CreateClient();
        _agentClient = agentFactory.CreateClient();
    }

    // ── Step 1 ─────────────────────────────────────────────────────────────────
    // Voice session creation is the entry-point for the patient interaction.
    // Asserts the session is persisted and surfaced with a stable GUID identity.

    [Fact]
    public async Task Journey_VoiceSessionCreate_ReturnsCreatedWithId()
    {
        var response = await _voiceClient.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetGuid().Should().NotBeEmpty();
    }

    // ── Step 2 ─────────────────────────────────────────────────────────────────
    // Transcript submission ends the real-time capture phase and transitions the
    // session to TranscriptProduced.  In production a Dapr pub/sub event is
    // published at this point to trigger the agent triage pipeline; in this test
    // the fire-and-forget publish is silently dropped (no Dapr sidecar in test).

    [Fact]
    public async Task Journey_TranscriptSubmit_ReturnsTranscriptProduced()
    {
        // Arrange — create voice session first
        var createResponse = await _voiceClient.PostAsJsonAsync("/api/v1/voice/sessions",
            new { PatientId = Guid.NewGuid() });
        var createDoc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var sessionId = createDoc.RootElement.GetProperty("id").GetGuid();

        // Act — submit the PHI-bearing transcript
        var transcriptResponse = await _voiceClient.PostAsJsonAsync(
            $"/api/v1/voice/sessions/{sessionId}/transcript",
            new { TranscriptText = PhiTranscript });

        // Assert
        transcriptResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = JsonDocument.Parse(await transcriptResponse.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("status").GetString()
            .Should().Be("TranscriptProduced");
    }

    // ── Step 3 + 4 ─────────────────────────────────────────────────────────────
    // The agent triage endpoint is the heart of the journey.  It receives the
    // transcript text (forwarded by the Dapr handler in production), runs the
    // SK plugin chain including the PHI redactor, hallucination guard, and
    // confidence router, and persists a TriageWorkflow row.
    //
    // In the Testing environment no AOAI credentials are configured so SK falls
    // back to the rule-based TriagePlugin.ClassifyUrgency, which is deterministic
    // and always returns a valid TriageLevel — guaranteeing a 201 without any
    // external network dependency.

    [Fact]
    public async Task Journey_AgentTriage_ReturnsCreatedWithValidLevel()
    {
        var sessionId = Guid.NewGuid();

        var response = await _agentClient.PostAsJsonAsync("/api/v1/agents/triage", new
        {
            SessionId = sessionId,
            TranscriptText = PhiTranscript,
            PatientId = (string?)null          // orchestrator uses sessionId as patientId fallback
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // assignedLevel must be a non-zero integer (TriageLevel enum value 1–5)
        doc.RootElement.GetProperty("assignedLevel").GetInt32()
            .Should().BeInRange(1, 5,
                because: "the rule-based fallback always returns a clinically valid triage level");
    }

    // ── Step 5 ─────────────────────────────────────────────────────────────────
    // The trace endpoint exposes the hierarchical agent trace to the frontend
    // Agent Console (W5).  In the Testing environment the InMemoryAgentTraceRecorder
    // is populated only when the LLM decorator records a step; for the rule-based
    // fallback path the recorder has no entry for the session, so 404 is the
    // expected status.  Neither 404 nor 200 should be a 500 — this assertion
    // guards against a server-side crash in the trace retrieval path.

    [Fact]
    public async Task Journey_TraceEndpoint_ReturnsSuccessOrNotFound()
    {
        // First, ensure a triage run exists so the session is known to the DB
        var sessionId = Guid.NewGuid();
        await _agentClient.PostAsJsonAsync("/api/v1/agents/triage", new
        {
            SessionId = sessionId,
            TranscriptText = PhiTranscript,
            PatientId = (string?)null
        });

        var response = await _agentClient.GetAsync($"/api/v1/agents/traces/{sessionId}");

        // Either 200 (trace found) or 404 (trace not populated by rule-based path) is valid
        response.StatusCode.Should().BeOneOf(
            new[] { HttpStatusCode.OK, HttpStatusCode.NotFound },
            because: "trace endpoint must not crash; 5xx indicates a code regression");
    }

    // ── Step 6 ─────────────────────────────────────────────────────────────────
    // The cancel endpoint (W5.6) provides the frontend interrupt button.  It
    // calls IAgentSessionCancellationRegistry.TryCancel, which is a no-op when
    // no in-flight loop is registered for the session, and then marks the trace
    // as cancelled via CompleteSessionAsync.  The endpoint always returns 202.

    [Fact]
    public async Task Journey_CancelSession_Returns202Regardless()
    {
        var sessionId = Guid.NewGuid();

        // Run a triage first so the trace recorder has a session entry to mark
        await _agentClient.PostAsJsonAsync("/api/v1/agents/triage", new
        {
            SessionId = sessionId,
            TranscriptText = PhiTranscript,
            PatientId = (string?)null
        });

        var response = await _agentClient.PostAsync(
            $"/api/v1/agents/sessions/{sessionId}/cancel", content: null);

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
    }

    // ── Step 7 ─────────────────────────────────────────────────────────────────
    // Clinician feedback (W3.4) is the UI action that closes the loop.  The
    // endpoint validates the 1–5 rating and returns 202 Accepted on success.

    [Fact]
    public async Task Journey_ClinicianFeedback_Returns202()
    {
        var sessionId = Guid.NewGuid();

        var response = await _agentClient.PostAsJsonAsync("/api/v1/agents/feedback", new
        {
            SessionId = sessionId.ToString(),
            WorkflowId = Guid.NewGuid().ToString(),
            Rating = 4,
            Correction = "Good triage, consider adding allergy history query."
        });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
    }

    // ── Full linear journey ────────────────────────────────────────────────────
    // Exercises all steps in sequence with a single shared sessionId so the
    // inter-step state (voice session → transcript → triage → trace → cancel →
    // feedback) is validated end-to-end with a coherent identity thread.

    [Fact]
    public async Task Journey_FullPipeline_AllStepsSucceed()
    {
        var patientId = Guid.NewGuid();
        var agentSessionId = Guid.NewGuid();

        // 1. Create voice session
        var voiceCreateResponse = await _voiceClient.PostAsJsonAsync(
            "/api/v1/voice/sessions",
            new { PatientId = patientId });
        voiceCreateResponse.StatusCode.Should().Be(HttpStatusCode.Created,
            because: "voice session creation must succeed before transcript upload");
        var voiceDoc = JsonDocument.Parse(await voiceCreateResponse.Content.ReadAsStringAsync());
        var voiceSessionId = voiceDoc.RootElement.GetProperty("id").GetGuid();

        // 2. Submit PHI-bearing transcript to voice session
        var transcriptResponse = await _voiceClient.PostAsJsonAsync(
            $"/api/v1/voice/sessions/{voiceSessionId}/transcript",
            new { TranscriptText = PhiTranscript });
        transcriptResponse.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "transcript submission must succeed so the event is available for triage");

        // 3. Agent triage — simulates the Dapr transcript.produced handler
        //    forwarding the transcript to the orchestrator
        var triageResponse = await _agentClient.PostAsJsonAsync("/api/v1/agents/triage", new
        {
            SessionId = agentSessionId,
            TranscriptText = PhiTranscript,
            PatientId = patientId.ToString()
        });
        triageResponse.StatusCode.Should().Be(HttpStatusCode.Created,
            because: "triage must persist a TriageWorkflow row regardless of LLM availability");

        var triageDoc = JsonDocument.Parse(await triageResponse.Content.ReadAsStringAsync());
        var workflowId = triageDoc.RootElement.GetProperty("id").GetGuid();
        workflowId.Should().NotBeEmpty();

        // 4. Triage level must be a valid TriageLevel (1–5)
        triageDoc.RootElement.GetProperty("assignedLevel").GetInt32()
            .Should().BeInRange(1, 5);

        // 5. Trace endpoint — must not return 5xx (200 or 404 both acceptable)
        var traceResponse = await _agentClient.GetAsync(
            $"/api/v1/agents/traces/{agentSessionId}");
        traceResponse.StatusCode.Should().BeOneOf(
            new[] { HttpStatusCode.OK, HttpStatusCode.NotFound },
            because: "trace endpoint must not 5xx");

        // 6. Cancel endpoint — always 202, no in-flight loop in test
        var cancelResponse = await _agentClient.PostAsync(
            $"/api/v1/agents/sessions/{agentSessionId}/cancel", content: null);
        cancelResponse.StatusCode.Should().Be(HttpStatusCode.Accepted);

        // 7. Clinician feedback — UI closes the loop
        var feedbackResponse = await _agentClient.PostAsJsonAsync(
            "/api/v1/agents/feedback", new
            {
                SessionId = agentSessionId.ToString(),
                WorkflowId = workflowId.ToString(),
                Rating = 5,
                Correction = (string?)null
            });
        feedbackResponse.StatusCode.Should().Be(HttpStatusCode.Accepted);
    }
}
