using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;

namespace HealthQCopilot.Infrastructure.Auth;

public static class JwtBearerExtensions
{
    /// <summary>
    /// Adds JWT Bearer authentication backed by Microsoft Entra ID.
    /// Falls back to an anonymous demo handler when AzureAd config is absent
    /// (local dev / CI / unauthenticated cloud demo deployment). The demo
    /// handler authenticates every request with a synthetic principal that
    /// carries all platform roles, so RequireAuthorization() and role-based
    /// policies pass through.
    /// </summary>
    public static IServiceCollection AddHealthcareAuth(
        this IServiceCollection services, IConfiguration configuration)
    {
        var azureAdSection = configuration.GetSection("AzureAd");
        if (!azureAdSection.Exists() || string.IsNullOrEmpty(azureAdSection["ClientId"]))
        {
            // Dev/CI/demo: every request is authenticated as a synthetic user
            // bearing all roles. Do NOT use this in a production tenant.
            services.AddAuthentication(DemoAnonymousAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, DemoAnonymousAuthHandler>(
                    DemoAnonymousAuthHandler.SchemeName, _ => { });
        }
        else
        {
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddMicrosoftIdentityWebApi(azureAdSection);
        }

        services.AddAuthorizationBuilder()
            .AddPolicy("Clinician", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Clinician", "Admin"))
            .AddPolicy("Admin", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Admin"))
            .AddPolicy("PlatformAdmin", policy =>
                policy.RequireClaim(ClaimTypes.Role, "PlatformAdmin", "Admin"))
            .AddPolicy("Patient", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Patient", "Admin"))
            .AddPolicy("PatientOrClinician", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Patient", "Clinician", "Admin"));

        return services;
    }
}

/// <summary>
/// Demo-only authentication handler. Every request succeeds as a synthetic
/// user with all platform roles. Active only when AzureAd config is absent.
/// </summary>
internal sealed class DemoAnonymousAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "DemoAnonymous";

    public DemoAnonymousAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "demo-user"),
            new Claim(ClaimTypes.Name, "Demo User"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(ClaimTypes.Role, "Clinician"),
            new Claim(ClaimTypes.Role, "PlatformAdmin"),
            new Claim(ClaimTypes.Role, "Patient"),
        };
        var identity = new ClaimsIdentity(claims, SchemeName, ClaimTypes.Name, ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
