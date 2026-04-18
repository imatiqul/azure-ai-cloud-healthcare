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

        group.MapGet("/users", async (
            string? role,
            bool? active,
            int page,
            int pageSize,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var query = db.UserAccounts.AsQueryable();
            if (!string.IsNullOrEmpty(role) && Enum.TryParse<UserRole>(role, true, out var roleEnum))
                query = query.Where(u => u.Role == roleEnum);
            if (active.HasValue)
                query = query.Where(u => u.IsActive == active.Value);
            var total = await query.CountAsync(ct);
            var users = await query.OrderBy(u => u.DisplayName)
                .Skip(Math.Max(0, page - 1) * Math.Clamp(pageSize, 1, 100))
                .Take(Math.Clamp(pageSize, 1, 100))
                .Select(u => new { u.Id, u.ExternalId, u.Email, u.DisplayName, Role = u.Role.ToString(), u.IsActive, u.LastLoginAt })
                .ToListAsync(ct);
            return Results.Ok(new { total, page, pageSize, users });
        });

        group.MapPut("/users/{id:guid}", async (
            Guid id,
            UpdateUserRequest request,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var user = await db.UserAccounts.FindAsync([id], ct);
            if (user is null) return Results.NotFound();
            user.UpdateProfile(request.Email, request.FullName);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.Email, user.DisplayName });
        });

        // GET /me — resolve current user from bearer token subject claim
        group.MapGet("/me", async (
            HttpContext http,
            IdentityDbContext db,
            CancellationToken ct) =>
        {
            var externalId = http.User.FindFirst("sub")?.Value
                ?? http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(externalId))
                return Results.Unauthorized();
            var user = await db.UserAccounts
                .FirstOrDefaultAsync(u => u.ExternalId == externalId, ct);
            return user is null
                ? Results.NotFound()
                : Results.Ok(new
                {
                    user.Id,
                    user.ExternalId,
                    user.Email,
                    user.DisplayName,
                    Role = user.Role.ToString(),
                    user.IsActive,
                    user.LastLoginAt
                });
        }).RequireAuthorization();

        return app;
    }
}

public record CreateUserRequest(string ExternalId, string Email, string FullName, UserRole Role);
public record UpdateUserRequest(string Email, string FullName);
