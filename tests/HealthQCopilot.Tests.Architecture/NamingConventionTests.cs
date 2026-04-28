using System.Reflection;
using FluentAssertions;
using HealthQCopilot.Agents.Endpoints;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Infrastructure.Behaviors;
using NetArchTest.Rules;
using Xunit;

namespace HealthQCopilot.Tests.Architecture;

/// <summary>
/// Enforces naming and structural conventions across the HealthQ Copilot codebase:
/// <list type="bullet">
/// <item>Extension classes must be static</item>
/// <item>Endpoint registration classes must be static</item>
/// <item>Interfaces must be prefixed with 'I'</item>
/// <item>Domain.Primitives must contain only abstractions</item>
/// </list>
/// </summary>
public sealed class NamingConventionTests
{
    private static readonly Assembly DomainAssembly =
        Assembly.GetAssembly(typeof(IDomainEvent))!;

    private static readonly Assembly InfrastructureAssembly =
        Assembly.GetAssembly(typeof(LoggingBehavior<,>))!;

    private static readonly Assembly AgentsAssembly =
        Assembly.GetAssembly(typeof(AgentEndpoints))!;

    // -----------------------------------------------------------------------
    // Extension method host classes must be static
    // -----------------------------------------------------------------------

    [Fact]
    public void Extension_Classes_In_Infrastructure_Should_Be_Static()
    {
        // Extension method containers must be declared static; the C# compiler
        // enforces this anyway, but this test documents the convention.
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .That()
            .HaveNameEndingWith("Extensions")
            .Should()
            .BeStatic()
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all types whose name ends with 'Extensions' must be " +
                     "static classes to host extension methods (C# language requirement)");
    }

    // -----------------------------------------------------------------------
    // Endpoint registration classes must be static
    // -----------------------------------------------------------------------

    [Fact]
    public void Endpoint_Registration_Classes_In_Agents_Should_Be_Static()
    {
        // Endpoint registration types follow the pattern:
        //   public static class XyzEndpoints { public static IEndpointRouteBuilder MapXyz(...) }
        // DTOs (e.g. RegisterModelRequest records) that co-reside in the namespace are
        // excluded by requiring the type name itself to end with "Endpoints".
        var result = Types
            .InAssembly(AgentsAssembly)
            .That()
            .ResideInNamespaceContaining(".Endpoints")
            .And()
            .HaveNameEndingWith("Endpoints")
            .And()
            .ArePublic()
            .Should()
            .BeStatic()
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all public endpoint registration classes must be static so that " +
                     "MapXxx extension methods can be called off IEndpointRouteBuilder");
    }

    // -----------------------------------------------------------------------
    // Interface naming: I-prefix convention
    // -----------------------------------------------------------------------

    [Fact]
    public void Interfaces_In_Infrastructure_Should_Have_I_Prefix()
    {
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .That()
            .AreInterfaces()
            .Should()
            .HaveNameStartingWith("I")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all interfaces must be prefixed with 'I' to follow .NET Framework " +
                     "Design Guidelines §3.7 and make the type's role immediately obvious");
    }

    [Fact]
    public void Interfaces_In_Domain_Should_Have_I_Prefix()
    {
        var result = Types
            .InAssembly(DomainAssembly)
            .That()
            .AreInterfaces()
            .Should()
            .HaveNameStartingWith("I")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all Domain interfaces must be prefixed with 'I' — this is the " +
                     "standard .NET naming convention and aids discoverability");
    }

    // -----------------------------------------------------------------------
    // Domain.Primitives must only contain abstractions
    // -----------------------------------------------------------------------

    [Fact]
    public void Domain_Primitives_Classes_Should_Be_Abstract()
    {
        // Domain.Primitives contains four abstract building blocks (Entity<TId>,
        // AggregateRoot<TId>, ValueObject, DomainEvent) plus concrete utilities
        // (Result, Result<T>, DomainEventNotification<T>). This test specifically
        // verifies that the four core base types remain abstract.
        var result = Types
            .InAssembly(DomainAssembly)
            .That()
            .ResideInNamespace("HealthQCopilot.Domain.Primitives")
            .And()
            .AreClasses()
            .And()
            .HaveNameMatching("^(Entity|AggregateRoot|ValueObject|DomainEvent)$")
            .Should()
            .BeAbstract()
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "HealthQCopilot.Domain.Primitives is an abstractions-only namespace; " +
                     "all classes (Entity, AggregateRoot, ValueObject, DomainEvent) " +
                     "must be abstract so that only domain-specific types can be instantiated");
    }
}
