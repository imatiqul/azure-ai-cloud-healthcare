using System.Reflection;
using FluentAssertions;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Infrastructure.Behaviors;
using NetArchTest.Rules;
using Xunit;

namespace HealthQCopilot.Tests.Architecture;

/// <summary>
/// Enforces the Clean Architecture layer dependency rules:
/// <list type="bullet">
/// <item>Domain has no dependency on Infrastructure or any microservice assembly</item>
/// <item>Infrastructure has no dependency on any specific microservice assembly</item>
/// </list>
/// </summary>
public sealed class LayerDependencyTests
{
    private static readonly Assembly DomainAssembly =
        Assembly.GetAssembly(typeof(AggregateRoot<>))!;

    private static readonly Assembly InfrastructureAssembly =
        Assembly.GetAssembly(typeof(LoggingBehavior<,>))!;

    // -----------------------------------------------------------------------
    // Domain layer independence
    // -----------------------------------------------------------------------

    [Fact]
    public void Domain_Should_Not_Depend_On_Infrastructure()
    {
        var result = Types
            .InAssembly(DomainAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Infrastructure")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "the Domain layer must not depend on Infrastructure to maintain " +
                     "Clean Architecture / Onion Architecture principles");
    }

    [Fact]
    public void Domain_Should_Not_Depend_On_AspNetCore()
    {
        var result = Types
            .InAssembly(DomainAssembly)
            .Should()
            .NotHaveDependencyOn("Microsoft.AspNetCore")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "the Domain layer must be framework-agnostic — " +
                     "it must not import ASP.NET Core types");
    }

    [Fact]
    public void Domain_Should_Not_Depend_On_EntityFrameworkCore()
    {
        var result = Types
            .InAssembly(DomainAssembly)
            .Should()
            .NotHaveDependencyOn("Microsoft.EntityFrameworkCore")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "the Domain layer must not depend on EF Core — " +
                     "persistence concerns belong in Infrastructure");
    }

    // -----------------------------------------------------------------------
    // Infrastructure layer isolation from specific microservices
    // -----------------------------------------------------------------------

    [Fact]
    public void Infrastructure_Should_Not_Depend_On_Agents_Service()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Agents")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Infrastructure is a shared cross-cutting layer that must not " +
                     "create circular or downward dependencies on the Agents microservice");
    }

    [Fact]
    public void Infrastructure_Should_Not_Depend_On_Voice_Service()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Voice")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Infrastructure must not depend on the Voice microservice");
    }

    [Fact]
    public void Infrastructure_Should_Not_Depend_On_Fhir_Service()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Fhir")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Infrastructure must not depend on the FHIR microservice");
    }

    [Fact]
    public void Infrastructure_Should_Not_Depend_On_Identity_Service()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Identity")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Infrastructure must not depend on the Identity microservice");
    }

    [Fact]
    public void Infrastructure_Should_Not_Depend_On_Notifications_Service()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .Should()
            .NotHaveDependencyOn("HealthQCopilot.Notifications")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Infrastructure must not depend on the Notifications microservice");
    }
}
