using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Identity.Web;

namespace HealthQCopilot.Infrastructure.Auth;

public static class JwtBearerExtensions
{
    /// <summary>
    /// Adds JWT Bearer authentication backed by Microsoft Entra ID.
    /// Falls back to a no-op scheme when AzureAd config is absent (local dev / CI).
    /// </summary>
    public static IServiceCollection AddHealthcareAuth(
        this IServiceCollection services, IConfiguration configuration)
    {
        var azureAdSection = configuration.GetSection("AzureAd");
        if (!azureAdSection.Exists() || string.IsNullOrEmpty(azureAdSection["ClientId"]))
        {
            // Dev/CI: add authentication with a permissive handler
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.RequireHttpsMetadata = false;
                    options.TokenValidationParameters = new()
                    {
                        ValidateIssuer = false,
                        ValidateAudience = false,
                        ValidateLifetime = false,
                        ValidateIssuerSigningKey = false,
                    };
                });
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
            .AddPolicy("Patient", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Patient", "Admin"))
            .AddPolicy("PatientOrClinician", policy =>
                policy.RequireClaim(ClaimTypes.Role, "Patient", "Clinician", "Admin"));

        return services;
    }
}
