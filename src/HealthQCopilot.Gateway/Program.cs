using HealthQCopilot.Gateway;
using HealthQCopilot.Infrastructure.Auth;
using HealthQCopilot.Infrastructure.Middleware;
using HealthQCopilot.Infrastructure.Observability;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHealthcareObservability(builder.Configuration, "gateway");
builder.Services.AddHealthcareAuth(builder.Configuration);
builder.Services.AddHealthcareRateLimiting();

builder.Services.AddCors(options =>
{
    var allowedOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>() ?? ["http://localhost:3000"];
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()); // required for SignalR
});

builder.Services.AddSignalR();

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddServiceDiscoveryDestinationResolver();

var app = builder.Build();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseRouting();

// SignalR hub — handled locally, not proxied through YARP
// Require auth on the hub; clients must pass a valid bearer token.
app.MapHub<GlobalHub>("/hubs/global").RequireAuthorization();

// Health endpoint is public (used by APIM / AKS liveness probes)
app.MapDefaultEndpoints();

// All proxied routes require authentication by default.
// Route-specific overrides (e.g. SMART /metadata) are handled via YARP AuthorizationPolicy metadata.
app.MapReverseProxy().RequireAuthorization();

app.Run();

public partial class Program { }
