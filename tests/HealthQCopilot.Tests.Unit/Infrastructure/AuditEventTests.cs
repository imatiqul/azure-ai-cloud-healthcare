using FluentAssertions;
using HealthQCopilot.Infrastructure.Messaging;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

/// <summary>
/// W1.5 — verifies the audit-event factories carry the linkage fields the
/// HIPAA evidence pack relies on (redaction proof, model + prompt version,
/// workflow dispatch targets).
/// </summary>
public sealed class AuditEventTests
{
    [Fact]
    public void AgentDecision_includes_model_and_prompt_metadata_when_provided()
    {
        var evt = AuditEvent.AgentDecision(
            sessionId: "s-1",
            triageLevel: "P3_Standard",
            guardApproved: true,
            userId: "clin-7",
            modelId: "gpt-4o",
            modelVersion: "2024-08-06",
            promptId: "triage-system-v1",
            promptVersion: "1.4",
            redactionEntityCount: 3);

        evt.EventType.Should().Be("agent_decision");
        evt.SessionId.Should().Be("s-1");
        evt.UserId.Should().Be("clin-7");
        evt.Details.Should().NotBeNull();
        evt.Details!["triageLevel"].Should().Be("P3_Standard");
        evt.Details["guardApproved"].Should().Be(true);
        evt.Details["modelId"].Should().Be("gpt-4o");
        evt.Details["modelVersion"].Should().Be("2024-08-06");
        evt.Details["promptId"].Should().Be("triage-system-v1");
        evt.Details["promptVersion"].Should().Be("1.4");
        evt.Details["redactionEntityCount"].Should().Be(3);
    }

    [Fact]
    public void AgentDecision_omits_optional_metadata_keys_when_not_supplied()
    {
        var evt = AuditEvent.AgentDecision("s-2", "P2_Urgent", guardApproved: false);

        evt.Details!.Should().ContainKey("triageLevel");
        evt.Details.Should().NotContainKey("modelId");
        evt.Details.Should().NotContainKey("promptVersion");
        evt.Details.Should().NotContainKey("redactionEntityCount");
    }

    [Fact]
    public void WorkflowDispatched_carries_targets_and_workflow_link()
    {
        var workflowId = Guid.NewGuid();
        var evt = AuditEvent.WorkflowDispatched(
            sessionId: "s-3",
            workflowId: workflowId,
            triageLevel: "P1_Immediate",
            dispatchTargets: new[] { "revenue", "fhir", "escalation_notification" });

        evt.EventType.Should().Be("workflow_dispatched");
        evt.Resource.Should().Be("triage_workflow");
        evt.Action.Should().Be("dispatch");
        evt.Details!["workflowId"].Should().Be(workflowId);
        evt.Details["triageLevel"].Should().Be("P1_Immediate");
        evt.Details["targets"].Should().BeAssignableTo<IReadOnlyCollection<string>>()
            .Which.Should().Contain(new[] { "revenue", "fhir", "escalation_notification" });
    }

    [Fact]
    public void PhiRedacted_records_kind_counts_and_no_raw_values()
    {
        var kinds = new Dictionary<string, int> { ["MRN"] = 2, ["SSN"] = 1 };
        var evt = AuditEvent.PhiRedacted("s-4", "TriageAgent", entityCount: 3, kinds);

        evt.EventType.Should().Be("phi_redacted");
        evt.Action.Should().Be("TriageAgent");
        evt.Details!["entityCount"].Should().Be(3);
        evt.Details["kinds"].Should().BeSameAs(kinds);
    }

    [Fact]
    public void ConsentDecision_denied_carries_full_metadata()
    {
        // W1.6b — consent-denied path emitted by TriageOrchestrator under the
        // HealthQ:PatientConsentGate flag. EventType must be the dedicated
        // "consent_decision" so right-of-access Kusto queries don't have to
        // grep AgentDecision rows for a magic triageLevel.
        var grantedAt = DateTimeOffset.UtcNow.AddDays(-30);
        var evt = AuditEvent.ConsentDecision(
            sessionId: "s-5",
            patientId: "PAT-42",
            scope: "triage",
            granted: false,
            reason: "patient-revoked",
            grantedBy: "self",
            grantedAt: grantedAt);

        evt.EventType.Should().Be("consent_decision");
        evt.Resource.Should().Be("patient_consent");
        evt.Action.Should().Be("deny");
        evt.SessionId.Should().Be("s-5");
        evt.Details!["scope"].Should().Be("triage");
        evt.Details["granted"].Should().Be(false);
        evt.Details["patientId"].Should().Be("PAT-42");
        evt.Details["reason"].Should().Be("patient-revoked");
        evt.Details["grantedBy"].Should().Be("self");
        evt.Details["grantedAt"].Should().Be(grantedAt);
    }

    [Fact]
    public void ConsentDecision_granted_uses_grant_action_and_omits_unset_fields()
    {
        var evt = AuditEvent.ConsentDecision(
            sessionId: "s-6", patientId: null, scope: "triage", granted: true);

        evt.Action.Should().Be("grant");
        evt.Details!["scope"].Should().Be("triage");
        evt.Details["granted"].Should().Be(true);
        evt.Details.Should().NotContainKey("patientId");
        evt.Details.Should().NotContainKey("reason");
        evt.Details.Should().NotContainKey("grantedBy");
        evt.Details.Should().NotContainKey("grantedAt");
    }
}
