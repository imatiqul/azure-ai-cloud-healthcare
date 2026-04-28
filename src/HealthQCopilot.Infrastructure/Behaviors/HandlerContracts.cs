using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Infrastructure.Behaviors;

/// <summary>
/// Handler contract for <see cref="ICommand"/> (void-result command).
/// Inherit from this in application-layer command handlers.
/// </summary>
public interface ICommandHandler<TCommand> : IRequestHandler<TCommand, Result>
    where TCommand : ICommand;

/// <summary>
/// Handler contract for <see cref="ICommand{TResult}"/>.
/// Inherit from this in application-layer command handlers.
/// </summary>
public interface ICommandHandler<TCommand, TResult> : IRequestHandler<TCommand, Result<TResult>>
    where TCommand : ICommand<TResult>;

/// <summary>
/// Handler contract for <see cref="IQuery{TResult}"/>.
/// Inherit from this in application-layer query handlers.
/// </summary>
public interface IQueryHandler<TQuery, TResult> : IRequestHandler<TQuery, Result<TResult>>
    where TQuery : IQuery<TResult>;
