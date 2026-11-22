using FluentAssertions;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Architecture;

/// <summary>
/// Spec 004-audit-identity, AC-001 and AC-005: every service that audits access to PHI registers
/// the audit middleware directly after authentication and before authorization, with nothing in
/// front of it that can answer a request, and a service that does not fails this test by name.
/// </summary>
public sealed class RequestPipelineOrderTests
{
    /// <summary>
    /// The services that audit access to PHI. The order rows and the census below both read this
    /// one list, so a service cannot be on one and not the other.
    /// </summary>
    private static readonly string[] AuditedServices =
    [
        "Agents", "Fhir", "Identity", "Notifications", "Ocr",
        "PopulationHealth", "RevenueCycle", "Scheduling", "Voice",
    ];

    public static IEnumerable<object[]> AuditedServiceRows => AuditedServices.Select(service => new object[] { service });

    private const string RightOrder = """
        app.MapOpenApi();
        app.UseCloudEvents();
        app.UseMiddleware<TenantContextMiddleware>();
        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseAuthentication();
        app.UseMiddleware<PhiAuditMiddleware>();
        app.UseAuthorization();
        app.UseHealthcareRateLimiting();
        """;

    // ── The nine services ─────────────────────────────────────────────────────

    [Theory]
    [MemberData(nameof(AuditedServiceRows))]
    public void TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization(string service)
    {
        var program = File.ReadAllText(ProgramPath(service));

        RequestPipelineOrder.Check(service, program).Should().BeNull();
    }

    [Fact]
    public void EveryServiceThatNamesTheAuditMiddlewareIsChecked()
    {
        // Any Program.cs that names the middleware, in whatever form, has to be on the list the
        // order rows are made from. A new service, or one that drops the audit, changes this.
        var naming = Directory
            .GetDirectories(Path.Combine(RepositoryRoot(), "src"), "HealthQCopilot.*")
            .Select(dir => (Name: Path.GetFileName(dir)["HealthQCopilot.".Length..], Program: Path.Combine(dir, "Program.cs")))
            .Where(s => File.Exists(s.Program) && RequestPipelineOrder.NamesAuditMiddleware(File.ReadAllText(s.Program)))
            .Select(s => s.Name)
            .Order(StringComparer.Ordinal);

        naming.Should().Equal(AuditedServices);
    }

    [Fact]
    public void TheAuditMiddlewareIsRegisteredNowhereButInAProgramFile()
    {
        // A registration tucked into an extension method or a helper would be invisible to the
        // order rows. Only the middleware's own file and the Program.cs files may name it.
        var src = Path.Combine(RepositoryRoot(), "src");
        var elsewhere = Directory
            .EnumerateFiles(src, "*.cs", SearchOption.AllDirectories)
            .Where(file => !IsBuildOutput(file)
                && Path.GetFileName(file) != "Program.cs"
                && Path.GetFileName(file) != RequestPipelineOrder.MiddlewareName + ".cs"
                && RequestPipelineOrder.NamesAuditMiddleware(File.ReadAllText(file)))
            .Select(file => Path.GetRelativePath(src, file).Replace('\\', '/'))
            .Order(StringComparer.Ordinal);

        elsewhere.Should().BeEmpty();
    }

    [Fact]
    public void WhatMaySitInFrontOfTheAuditIsWrittenDownWithAReason()
    {
        RequestPipelineOrder.AllowedBeforeAudit.Values.Should().NotBeEmpty();
        RequestPipelineOrder.AllowedBeforeAudit.Values.Where(string.IsNullOrWhiteSpace).Should().BeEmpty();
        RequestPipelineOrder.Exceptions.Keys.Order(StringComparer.Ordinal).Should().Equal("Fhir");
        RequestPipelineOrder.Exceptions["Fhir"].Keys.Should().Equal("app.UseMiddleware<ConsentEnforcementMiddleware>();");
    }

    // ── The check itself ──────────────────────────────────────────────────────

    [Fact]
    public void TheRightOrderPasses()
    {
        RequestPipelineOrder.Check("Sample", RightOrder).Should().BeNull();
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

    [Theory]
    [InlineData("app.UseMiddleware<IdempotencyMiddleware>();")]
    [InlineData("app.MapWhen(context => true, branch => branch.Run(Refuse));")]
    [InlineData("app.Run(Refuse);")]
    public void AnythingBetweenAuthenticationAndTheAuditFails(string statement)
    {
        var somethingBetween = $"""
            app.UseAuthentication();
            {statement}
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", somethingBetween)
            .Should().StartWith($"Sample: {statement} is registered between authentication and the PHI audit middleware");
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

    [Theory]
    [InlineData("app.UseMiddleware<ConsentEnforcementMiddleware>();")]
    [InlineData("app.UseHealthcareRateLimiting();")]
    [InlineData("app.UseOutputCache();")]
    public void AMiddlewareInFrontOfAuthenticationThatIsNotOnTheListFails(string statement)
    {
        var inFront = $"""
            app.UseMiddleware<SecurityHeadersMiddleware>();
            {statement}
            app.UseAuthentication();
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", inFront)
            .Should().StartWith($"Sample: {statement} is registered in front of the PHI audit middleware and is not on the list");
    }

    [Fact]
    public void TheConsentMiddlewareIsToleratedInTheFhirServiceOnly()
    {
        const string fhirOrder = """
            app.UseMiddleware<SecurityHeadersMiddleware>();
            app.UseMiddleware<ConsentEnforcementMiddleware>();
            app.UseAuthentication();
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Fhir", fhirOrder).Should().BeNull();
        RequestPipelineOrder.Check("Voice", fhirOrder).Should().Contain("is not on the list");
    }

    [Theory]
    [InlineData("// app.UseMiddleware<PhiAuditMiddleware>();")]
    [InlineData("/* app.UseMiddleware<PhiAuditMiddleware>(); */")]
    [InlineData("")]
    public void ARegistrationThatIsCommentedOutOrMissingDoesNotCount(string auditLine)
    {
        var withoutAudit = $"""
            app.UseAuthentication();
            {auditLine}
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", withoutAudit)
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

    [Fact]
    public void ARegistrationInsideABlockFails()
    {
        const string conditional = """
            if (builder.Environment.IsProduction())
            {
                app.UseAuthentication();
            }
            app.UseMiddleware<PhiAuditMiddleware>();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", conditional)
            .Should().StartWith("Sample: authentication is registered inside a block or as part of a longer statement");
    }

    [Fact]
    public void AChainedRegistrationFails()
    {
        const string chained = """
            app.UseAuthentication().UseMiddleware<PhiAuditMiddleware>().UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", chained)
            .Should().StartWith("Sample: the PHI audit middleware is not registered");
    }

    [Fact]
    public void ASecondRegistrationFails()
    {
        const string twice = RightOrder + "\napp.UseMiddleware<PhiAuditMiddleware>();";

        RequestPipelineOrder.Check("Sample", twice)
            .Should().Be("Sample: the PHI audit middleware is registered 2 times; this check reads one registration of each");
    }

    [Theory]
    [InlineData("app.UseMiddleware(typeof(PhiAuditMiddleware));")]
    [InlineData("app.UsePhiAudit();")]
    public void ARegistrationInAnotherFormIsNotRead(string statement)
    {
        var otherForm = $"""
            {statement}
            app.UseAuthentication();
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", otherForm)
            .Should().Be("Sample: the PHI audit middleware is not registered");
    }

    [Fact]
    public void TheMiddlewareNamedASecondTimeFails()
    {
        const string namedTwice = RightOrder + "\nvar auditType = typeof(PhiAuditMiddleware);";

        RequestPipelineOrder.Check("Sample", namedTwice)
            .Should().StartWith("Sample: Program.cs names PhiAuditMiddleware in 2 places");
    }

    [Fact]
    public void APreprocessorConditionFails()
    {
        const string conditional = """
            app.UseAuthentication();
            #if AUDIT
            app.UseMiddleware<PhiAuditMiddleware>();
            #endif
            app.UseAuthorization();
            """;

        RequestPipelineOrder.Check("Sample", conditional)
            .Should().Be("Sample: Program.cs has a preprocessor condition, which this check cannot read");
    }

    [Fact]
    public void NamingTheMiddlewareInACommentIsNotNamingIt()
    {
        RequestPipelineOrder.NamesAuditMiddleware("// see PhiAuditMiddleware\n/* PhiAuditMiddleware */\nvar x = 1;").Should().BeFalse();
        RequestPipelineOrder.NamesAuditMiddleware("app.UseMiddleware(typeof(PhiAuditMiddleware));").Should().BeTrue();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string ProgramPath(string service) =>
        Path.Combine(RepositoryRoot(), "src", $"HealthQCopilot.{service}", "Program.cs");

    private static bool IsBuildOutput(string file)
    {
        var parts = file.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return parts.Contains("bin") || parts.Contains("obj");
    }

    private static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "HealthQCopilot.sln")))
            dir = dir.Parent;
        return dir?.FullName
            ?? throw new InvalidOperationException("Unable to locate the repository root from " + AppContext.BaseDirectory);
    }
}
