using FluentAssertions;
using HealthQCopilot.Infrastructure.Behaviors;
using MediatR;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

// ─────────────────────────────────────────────
// Test stubs
// ─────────────────────────────────────────────

public sealed record LoggingBehaviorTestRequest : IRequest<string>;

public sealed record LoggingBehaviorThrowingRequest : IRequest<string>;

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

public class LoggingBehaviorTests
{
    private readonly ILogger<LoggingBehavior<LoggingBehaviorTestRequest, string>> _logger;
    private readonly LoggingBehavior<LoggingBehaviorTestRequest, string> _sut;

    public LoggingBehaviorTests()
    {
        _logger = Substitute.For<ILogger<LoggingBehavior<LoggingBehaviorTestRequest, string>>>();
        _sut = new LoggingBehavior<LoggingBehaviorTestRequest, string>(_logger);
    }

    [Fact]
    public async Task Handle_WhenNextSucceeds_ReturnsResponseFromNext()
    {
        // Arrange
        const string expected = "ok";
        RequestHandlerDelegate<string> next = () => Task.FromResult(expected);

        // Act
        var result = await _sut.Handle(new LoggingBehaviorTestRequest(), next, CancellationToken.None);

        // Assert
        result.Should().Be(expected);
    }

    [Fact]
    public async Task Handle_WhenNextSucceeds_LogsHandlingAndHandled()
    {
        // Arrange
        RequestHandlerDelegate<string> next = () => Task.FromResult("response");

        // Act
        await _sut.Handle(new LoggingBehaviorTestRequest(), next, CancellationToken.None);

        // Assert — two informational log entries (Handling + Handled)
        _logger.ReceivedWithAnyArgs(2).Log(
            LogLevel.Information,
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            Arg.Any<Exception>(),
            Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task Handle_WhenNextThrows_LogsErrorAndRethrows()
    {
        // Arrange
        var boom = new InvalidOperationException("boom");
        RequestHandlerDelegate<string> next = () => throw boom;

        // Act
        Func<Task> act = async () =>
            await _sut.Handle(new LoggingBehaviorTestRequest(), next, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("boom");

        _logger.ReceivedWithAnyArgs(2).Log(   // 1× Handling + 1× Error
            Arg.Any<LogLevel>(),
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            Arg.Any<Exception>(),
            Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task Handle_WhenNextThrows_LogsAtErrorLevel()
    {
        // Arrange
        RequestHandlerDelegate<string> next = () => throw new Exception("fail");

        // Act
        try { await _sut.Handle(new LoggingBehaviorTestRequest(), next, CancellationToken.None); }
        catch { /* expected */ }

        // Assert — at least one error-level log was emitted
        _logger.ReceivedWithAnyArgs().Log(
            LogLevel.Error,
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            Arg.Any<Exception>(),
            Arg.Any<Func<object, Exception?, string>>());
    }
}
