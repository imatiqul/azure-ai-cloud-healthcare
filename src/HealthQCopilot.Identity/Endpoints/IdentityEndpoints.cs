using HealthQCopilot.Domain.Identity;
using HealthQCopilot.Identity.Persistence;
using HealthQCopilot.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Identity.Endpoints;

public static class IdentityEndpoints
{
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/identity")
            .WithTags("Identity")
            .RequireAuthorization("Admin")
            .WithAutoValidation();

        group.MapPost("/users", async (
            CreateUserRequest request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = UserAccount.Create(Guid.NewGuid(), request.ExternalId, request.Email, request.FullName, request.Role);
            db.UserAccounts.Add(user);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/identity/users/{user.Id}",
                new { user.Id, user.Email, user.Role });
        });

        group.MapGet("/users/{id:guid}", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            return user is null ? Results.NotFound() : Results.Ok(new
            {
                user.Id,
                user.ExternalId,
                user.Email,
                user.DisplayName,
                user.Role,
                user.IsActive,
                user.LastLoginAt
            });
        });

        group.MapGet("/users/by-external/{externalId}", async (
            string externalId,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == externalId, ct);
            return user is null ? Results.NotFound() : Results.Ok(new
            {
                user.Id,
                user.ExternalId,
                user.Email,
                user.DisplayName,
                user.Role,
                user.IsActive
            });
        });

        group.MapPost("/users/{id:guid}/login", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.RecordLogin();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.LastLoginAt });
        });

        group.MapPost("/users/{id:guid}/deactivate", async (
            Guid id,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.Deactivate();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.IsActive });
        });

        return app;
    }
}

public record CreateUserRequest(string ExternalId, string Email, string FullName, UserRole Role);
