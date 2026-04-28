using MediatR;

namespace HealthQCopilot.Domain.Primitives;

/// <summary>
/// Marker interface for MediatR queries that return a typed <see cref="Result{TValue}"/>.
/// Queries are read-only operations that never modify state.
/// Register a corresponding <c>IQueryHandler&lt;TQuery, TResult&gt;</c> in the application layer.
/// </summary>
public interface IQuery<TResult> : IRequest<Result<TResult>>;
