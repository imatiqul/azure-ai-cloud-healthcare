using FluentValidation;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Infrastructure.Behaviors;

/// <summary>
/// MediatR pipeline behavior that runs FluentValidation validators registered for the request type.
/// Returns a <see cref="Result"/> or <see cref="Result{T}"/> failure — never throws — when validation fails.
/// Only activates when at least one <see cref="IValidator{T}"/> is registered for the request type.
/// </summary>
public sealed class ValidationBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!validators.Any())
            return await next();

        var context = new ValidationContext<TRequest>(request);

        var failures = (await Task.WhenAll(
                validators.Select(v => v.ValidateAsync(context, cancellationToken))))
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count == 0)
            return await next();

        var errorMessage = string.Join("; ", failures.Select(f => f.ErrorMessage));

        // Return the appropriate failure wrapper based on the response type.
        // Both Result and Result<T> are supported; anything else throws.
        if (typeof(TResponse) == typeof(Result))
            return (TResponse)(object)Result.Failure(errorMessage);

        if (typeof(TResponse).IsGenericType &&
            typeof(TResponse).GetGenericTypeDefinition() == typeof(Result<>))
        {
            var failureMethod = typeof(Result<>)
                .MakeGenericType(typeof(TResponse).GenericTypeArguments[0])
                .GetMethod(nameof(Result.Failure), [typeof(string)])!;

            return (TResponse)failureMethod.Invoke(null, [errorMessage])!;
        }

        throw new ValidationException(failures);
    }
}
