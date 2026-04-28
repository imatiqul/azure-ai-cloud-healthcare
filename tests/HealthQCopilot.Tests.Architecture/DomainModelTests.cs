using System.Reflection;
using FluentAssertions;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Infrastructure.Behaviors;
using HealthQCopilot.Infrastructure.Persistence;
using NetArchTest.Rules;
using Xunit;

namespace HealthQCopilot.Tests.Architecture;

/// <summary>
/// Enforces DDD domain-model conventions:
/// <list type="bullet">
/// <item>Domain events reside in *.Events namespaces and implement IDomainEvent</item>
/// <item>MediatR pipeline behaviors are concrete and reside in Infrastructure.Behaviors</item>
/// <item>DbContext types in Infrastructure reside in Infrastructure.Persistence</item>
/// </list>
/// </summary>
public sealed class DomainModelTests
{
    private static readonly Assembly DomainAssembly =
        Assembly.GetAssembly(typeof(IDomainEvent))!;

    private static readonly Assembly InfrastructureAssembly =
        Assembly.GetAssembly(typeof(LoggingBehavior<,>))!;

    // -----------------------------------------------------------------------
    // Domain event placement rules
    // -----------------------------------------------------------------------

    [Fact]
    public void Domain_Events_Should_Reside_In_Events_Namespaces()
    {
        // All concrete (non-abstract, non-interface) types that implement IDomainEvent
        // in the Domain assembly must live in a *.Events namespace.
        // DomainEvent (abstract record) in Primitives is excluded by AreNotAbstract().
        var result = Types
            .InAssembly(DomainAssembly)
            .That()
            .ImplementInterface(typeof(IDomainEvent))
            .And()
            .AreNotAbstract()
            .And()
            .AreNotInterfaces()
            .Should()
            .ResideInNamespaceContaining(".Events")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all concrete domain event types must be placed in a *.Events " +
                     "sub-namespace to make the domain model self-documenting and browsable");
    }

    [Fact]
    public void Domain_Events_Should_Not_Reside_In_Primitives_Namespace()
    {
        // Concrete domain events must NOT be in Primitives — only abstractions live there.
        var result = Types
            .InAssembly(DomainAssembly)
            .That()
            .ImplementInterface(typeof(IDomainEvent))
            .And()
            .AreNotAbstract()
            .And()
            .AreNotInterfaces()
            .Should()
            .NotResideInNamespace("HealthQCopilot.Domain.Primitives")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "Primitives contains only abstractions (AggregateRoot, Entity, " +
                     "DomainEvent, ValueObject). Concrete events belong in *.Events namespaces");
    }

    // -----------------------------------------------------------------------
    // Infrastructure pipeline behavior rules
    // -----------------------------------------------------------------------

    [Fact]
    public void Pipeline_Behaviors_Should_Reside_In_Infrastructure_Behaviors_Namespace()
    {
        // All types whose names end with "Behavior" in Infrastructure must live in
        // the HealthQCopilot.Infrastructure.Behaviors namespace.
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .That()
            .HaveNameEndingWith("Behavior")
            .Should()
            .ResideInNamespace("HealthQCopilot.Infrastructure.Behaviors")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "MediatR pipeline behaviors must be co-located in " +
                     "HealthQCopilot.Infrastructure.Behaviors for discoverability");
    }

    [Fact]
    public void Pipeline_Behaviors_Should_Be_Concrete_Not_Abstract()
    {
        // Behaviors are registered as implementations; abstract behaviors are not
        // directly registerable in the MediatR pipeline.
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .That()
            .HaveNameEndingWith("Behavior")
            .Should()
            .NotBeAbstract()
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "MediatR pipeline behaviors must be concrete classes that can " +
                     "be directly registered with services.AddMediatR()");
    }

    // -----------------------------------------------------------------------
    // Infrastructure persistence placement rules
    // -----------------------------------------------------------------------

    [Fact]
    public void Infrastructure_DbContext_Types_Should_Reside_In_Persistence_Namespace()
    {
        // DbContext types that live in the Infrastructure shared assembly (OutboxDbContext,
        // AuditDbContext) must be in the Infrastructure.Persistence namespace.
        // Microservice-specific DbContexts live in their own projects and are not tested here.
        var result = Types
            .InAssembly(InfrastructureAssembly)
            .That()
            .HaveNameEndingWith("DbContext")
            .Should()
            .ResideInNamespace("HealthQCopilot.Infrastructure.Persistence")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(
            because: "all DbContext types in the Infrastructure assembly must live in " +
                     "HealthQCopilot.Infrastructure.Persistence to keep persistence " +
                     "concerns co-located");
    }
}
