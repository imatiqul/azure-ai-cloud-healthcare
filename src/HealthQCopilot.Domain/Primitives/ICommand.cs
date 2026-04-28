using MediatR;

namespace HealthQCopilot.Domain.Primitives;

/// <summary>
/// Marker interface for MediatR commands that return a <see cref="Result"/>.
/// Register a corresponding <c>ICommandHandler&lt;TCommand&gt;</c> in the application layer.
/// </summary>
public interface ICommand : IRequest<Result>;

/// <summary>
/// Marker interface for MediatR commands that return a typed <see cref="Result{TValue}"/>.
/// Register a corresponding <c>ICommandHandler&lt;TCommand, TResult&gt;</c> in the application layer.
/// </summary>
public interface ICommand<TResult> : IRequest<Result<TResult>>;
