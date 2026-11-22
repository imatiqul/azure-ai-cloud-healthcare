using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Architecture;

/// <summary>
/// Spec 004-audit-identity, AC-001 and AC-005: every service that audits access to PHI registers
/// the audit middleware directly after authentication and before authorization, and a service
/// that does not fails this test by name.
/// </summary>
public sealed class RequestPipelineOrderTests
{
    private static readonly string[] AuditedServices =
    [
        "Agents", "Fhir", "Identity", "Notifications", "Ocr",
        "PopulationHealth", "RevenueCycle", "Scheduling", "Voice",
    ];

    [Theory]
    [InlineData("Agents")]
    [InlineData("Fhir")]
    [InlineData("Identity")]
    [InlineData("Notifications")]
    [InlineData("Ocr")]
    [InlineData("PopulationHealth")]
    [InlineData("RevenueCycle")]
    [InlineData("Scheduling")]
    [InlineData("Voice")]
    public void TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization(string service)
    {
        var program = File.ReadAllText(ProgramPath(service));

        RequestPipelineOrder.Check(service, program).Should().BeNull();
    }

    [Fact]
    public void EveryServiceThatRegistersTheAuditMiddlewareIsChecked()
    {
        // A new service that adds the middleware, or one that drops it, changes this list
        // and so has to be looked at.
        var registering = Directory
            .GetDirectories(Path.Combine(RepositoryRoot(), "src"), "HealthQCopilot.*")
            .Select(dir => (Name: Path.GetFileName(dir)["HealthQCopilot.".Length..], Program: Path.Combine(dir, "Program.cs")))
            .Where(s => File.Exists(s.Program) && RequestPipelineOrder.RegistersAudit(File.ReadAllText(s.Program)))
            .Select(s => s.Name)
            .Order(StringComparer.Ordinal);

        registering.Should().Equal(AuditedServices);
    }

    [Fact]
    public void AuditBeforeAuthenticationFailsAndNamesTheService()
    {
        const string oldOrder = """
            app.UseMiddleware<SecurityHeadersMiddleware>();
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthentication();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", oldOrder)
            .Should().StartWith("Sample: the PHI audit middleware is registered before authentication");
    }

    [Fact]
    public void AuditAfterAuthorizationFails()
    {
        const string tooLate = """
            app.UseAuthentication();
            app.UseAuthorization();
            app.UseMiddleware<PhiAuditMiddleware>();
            """;

        RequestPipelineOrder.Check("Sample", tooLate)
            .Should().StartWith("Sample: the PHI audit middleware is registered after authorization");
    }

    [Fact]
    public void AMiddlewareBetweenAuthenticationAndTheAuditFails()
    {
        const string somethingInFront = """
            app.UseAuthentication();
            app.UseMiddleware<IdempotencyMiddleware>();
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", somethingInFront)
            .Should().Contain("app.UseMiddleware<IdempotencyMiddleware>(); is registered between authentication and the PHI audit middleware");
    }

    [Fact]
    public void AMiddlewareBetweenTheAuditAndAuthorizationIsAllowed()
    {
        const string auditOutside = """
            app.UseAuthentication();
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseMiddleware<IdempotencyMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", auditOutside).Should().BeNull();
    }

    [Fact]
    public void ARegistrationThatIsCommentedOutDoesNotCount()
    {
        const string commentedOut = """
            app.UseAuthentication();
            // app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", commentedOut)
            .Should().Be("Sample: the PHI audit middleware is not registered");
    }

    [Fact]
    public void AMissingAuthenticationOrAuthorizationFails()
    {
        RequestPipelineOrder.Check("Sample", "app.UseMiddleware<PhiAuditMiddleware>();\napp.UseAuthorization();")
            .Should().Be("Sample: authentication is not registered");
        RequestPipelineOrder.Check("Sample", "app.UseAuthentication();\napp.UseMiddleware<PhiAuditMiddleware>();")
            .Should().Be("Sample: authorization is not registered");
    }

    private static string ProgramPath(string service) =>
        Path.Combine(RepositoryRoot(), "src", $"HealthQCopilot.{service}", "Program.cs");

    private static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "HealthQCopilot.sln")))
            dir = dir.Parent;
        return dir?.FullName
            ?? throw new InvalidOperationException("Unable to locate the repository root from " + AppContext.BaseDirectory);
    }
}
