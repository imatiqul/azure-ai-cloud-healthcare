using FluentAssertions;
using HealthQCopilot.Infrastructure.AI;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Agents;

/// <summary>
/// W1.6 — guards the patient consent gate's deny-by-default contract. The
/// default service is the *only* consent provider in dev/test, so its rules
/// directly determine whether AI-assisted triage runs for a given patient
/// when the <c>HealthQ:PatientConsentGate</c> flag is on. Real prod environments
/// swap in a registry-backed implementation, but the contract enforced here
/// (non-PHI scopes pass, synthetic ids pass, everything else denies) MUST hold
/// to keep eval + dev workflows green without weakening prod safety.
/// </summary>
public sealed class DefaultConsentServiceTests
{
    private readonly DefaultConsentService _sut = new();

    [Theory]
    [InlineData("platform-guide")]
    [InlineData("demo")]
    public async Task NonPhi_scopes_are_granted_by_default(string scope)
    {
        var decision = await _sut.CheckAsync("session-1", patientId: "real-patient-1", scope, default);

        decision.Granted.Should().BeTrue();
        decision.Reason.Should().Be("non-phi-scope");
    }

    [Fact]
    public async Task Synthetic_patient_ids_pass_through_for_eval()
    {
        var decision = await _sut.CheckAsync("session-1", patientId: "SYN-12345", scope: "triage", default);

        decision.Granted.Should().BeTrue();
        decision.Reason.Should().Be("synthetic-or-anonymous");
    }

    [Fact]
    public async Task Anonymous_session_passes_through()
    {
        var decision = await _sut.CheckAsync("session-1", patientId: null, scope: "triage", default);

        decision.Granted.Should().BeTrue();
        decision.Reason.Should().Be("synthetic-or-anonymous");
    }

    [Fact]
    public async Task Real_patient_PHI_scope_is_denied_by_default()
    {
        // Fail-safe — without an explicit consent provider, AI-assisted PHI
        // workflows MUST NOT run. This is the production-blocker behavior.
        var decision = await _sut.CheckAsync("session-1", patientId: "patient-001", scope: "triage", default);

        decision.Granted.Should().BeFalse();
        decision.Reason.Should().Be("no-consent-provider-configured");
        decision.GrantedAt.Should().BeNull();
        decision.GrantedBy.Should().BeNull();
    }
}
