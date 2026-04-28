using FluentAssertions;
using FluentValidation;
using HealthQCopilot.Domain.Primitives;
using HealthQCopilot.Infrastructure.Behaviors;
using MediatR;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

// ─────────────────────────────────────────────
// Test stubs
// ─────────────────────────────────────────────

public sealed record NoValidatorRequest(string Value) : IRequest<Result>;

public sealed record ValidatedBehaviorRequest(string Name) : IRequest<Result>;

internal sealed class ValidatedBehaviorRequestValidator : AbstractValidator<ValidatedBehaviorRequest>
{
    public ValidatedBehaviorRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required");
        RuleFor(x => x.Name).MinimumLength(3).WithMessage("Name must be at least 3 characters");
    }
}

public sealed record GenericBehaviorRequest(string Value) : IRequest<Result<string>>;

internal sealed class GenericBehaviorRequestValidator : AbstractValidator<GenericBehaviorRequest>
{
    public GenericBehaviorRequestValidator()
    {
        RuleFor(x => x.Value).NotEmpty().WithMessage("Value cannot be empty");
    }
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

public class ValidationBehaviorTests
{
    // ── No validators registered ─────────────────────────────────────────────

    [Fact]
    public async Task Handle_WithNoValidators_CallsNextAndReturnsResponse()
    {
        // Arrange
        var sut = new ValidationBehavior<NoValidatorRequest, Result>(
            validators: []);

        var called = false;
        RequestHandlerDelegate<Result> next = () =>
        {
            called = true;
            return Task.FromResult(Result.Success());
        };

        // Act
        var result = await sut.Handle(new NoValidatorRequest("x"), next, CancellationToken.None);

        // Assert
        called.Should().BeTrue();
        result.IsSuccess.Should().BeTrue();
    }

    // ── Validation passes ────────────────────────────────────────────────────

    [Fact]
    public async Task Handle_WithPassingValidator_CallsNext()
    {
        // Arrange
        var sut = new ValidationBehavior<ValidatedBehaviorRequest, Result>(
            validators: [new ValidatedBehaviorRequestValidator()]);

        var called = false;
        RequestHandlerDelegate<Result> next = () =>
        {
            called = true;
            return Task.FromResult(Result.Success());
        };

        // Act
        var result = await sut.Handle(new ValidatedBehaviorRequest("Alice"), next, CancellationToken.None);

        // Assert
        called.Should().BeTrue();
        result.IsSuccess.Should().BeTrue();
    }

    // ── Validation fails — Result response ──────────────────────────────────

    [Fact]
    public async Task Handle_WithFailingValidator_ReturnsResultFailure_WithoutCallingNext()
    {
        // Arrange
        var sut = new ValidationBehavior<ValidatedBehaviorRequest, Result>(
            validators: [new ValidatedBehaviorRequestValidator()]);

        var called = false;
        RequestHandlerDelegate<Result> next = () =>
        {
            called = true;
            return Task.FromResult(Result.Success());
        };

        // Act
        var result = await sut.Handle(new ValidatedBehaviorRequest(""), next, CancellationToken.None);

        // Assert
        called.Should().BeFalse("next should not be called when validation fails");
        result.IsFailure.Should().BeTrue();
        result.Error.Should().Contain("Name is required");
    }

    [Fact]
    public async Task Handle_WithMultipleFailures_JoinsAllErrorMessages()
    {
        // Arrange — empty string triggers both "required" and "min-length" rules
        var sut = new ValidationBehavior<ValidatedBehaviorRequest, Result>(
            validators: [new ValidatedBehaviorRequestValidator()]);

        RequestHandlerDelegate<Result> next = () => Task.FromResult(Result.Success());

        // Act
        var result = await sut.Handle(new ValidatedBehaviorRequest(""), next, CancellationToken.None);

        // Assert — both messages present in the joined error string
        result.Error.Should().Contain("Name is required");
        result.Error.Should().Contain("Name must be at least 3 characters");
    }

    // ── Validation fails — Result<T> response ───────────────────────────────

    [Fact]
    public async Task Handle_WithFailingValidator_AndGenericResult_ReturnsGenericFailure()
    {
        // Arrange
        var sut = new ValidationBehavior<GenericBehaviorRequest, Result<string>>(
            validators: [new GenericBehaviorRequestValidator()]);

        RequestHandlerDelegate<Result<string>> next =
            () => Task.FromResult(Result<string>.Success("ok"));

        // Act
        var result = await sut.Handle(new GenericBehaviorRequest(""), next, CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Should().Contain("Value cannot be empty");
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WithPassingValidator_AndGenericResult_ReturnsSuccessFromNext()
    {
        // Arrange
        var sut = new ValidationBehavior<GenericBehaviorRequest, Result<string>>(
            validators: [new GenericBehaviorRequestValidator()]);

        RequestHandlerDelegate<Result<string>> next =
            () => Task.FromResult(Result<string>.Success("hello"));

        // Act
        var result = await sut.Handle(new GenericBehaviorRequest("hello"), next, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be("hello");
    }
}
