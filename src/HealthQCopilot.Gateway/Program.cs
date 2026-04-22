using HealthQCopilot.Gateway;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddSignalR();

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddServiceDiscoveryDestinationResolver();

var app = builder.Build();

app.UseRouting();

// SignalR hub — handled locally, not proxied through YARP
app.MapHub<GlobalHub>("/hubs/global");

app.MapReverseProxy();
app.MapDefaultEndpoints();

app.Run();

public partial class Program { }
