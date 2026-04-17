using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace HealthQCopilot.Infrastructure.Validation;

/// <summary>
/// Endpoint filter that automatically validates request bodies using registered FluentValidation validators.
/// Add to a RouteGroup with .AddEndpointFilter&lt;AutoValidationFilter&gt;() or use .WithAutoValidation().
/// </summary>
public sealed class AutoValidationFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        foreach (var arg in context.Arguments)
        {
            if (arg is null or CancellationToken or HttpContext) continue;

            var argType = arg.GetType();
            if (!argType.IsClass || argType == typeof(string)) continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argType);
            if (context.HttpContext.RequestServices.GetService(validatorType) is not IValidator validator)
                continue;

            var validationContext = new ValidationContext<object>(arg);
            var result = await validator.ValidateAsync(validationContext);

            if (!result.IsValid)
                return Results.ValidationProblem(result.ToDictionary());
        }

        return await next(context);
    }
}

public static class ValidationExtensions
{
    /// <summary>
    /// Adds automatic FluentValidation to all endpoints in this group.
    /// </summary>
    public static RouteGroupBuilder WithAutoValidation(this RouteGroupBuilder group)
    {
        group.AddEndpointFilter<AutoValidationFilter>();
        return group;
    }
}
