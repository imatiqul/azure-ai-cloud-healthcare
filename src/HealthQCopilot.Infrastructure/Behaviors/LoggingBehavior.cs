using System.Diagnostics;
using MediatR;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Behaviors;

/// <summary>
/// MediatR pipeline behavior that logs command/query execution with elapsed time and result status.
/// Produces a structured log entry for every request flowing through the CQRS pipeline.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse>(
    ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;
        var sw = Stopwatch.StartNew();

        logger.LogInformation(
            "Handling {RequestName}",
            requestName);

        try
        {
            var response = await next();
            sw.Stop();

            logger.LogInformation(
                "Handled {RequestName} in {ElapsedMs}ms",
                requestName,
                sw.ElapsedMilliseconds);

            return response;
        }
        catch (Exception ex)
        {
            sw.Stop();
            logger.LogError(
                ex,
                "Error handling {RequestName} after {ElapsedMs}ms",
                requestName,
                sw.ElapsedMilliseconds);
            throw;
        }
    }
}
