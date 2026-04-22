using Microsoft.AspNetCore.SignalR;

namespace HealthQCopilot.Gateway;

/// <summary>
/// Global SignalR hub — provides a persistent WebSocket/long-polling connection
/// for the shell dashboard to receive real-time push updates (stats, alerts).
///
/// Clients join named groups to receive targeted broadcasts:
///   - "dashboard"  — aggregate stats updates (sent via IHubContext from microservices)
///
/// The hub itself is intentionally minimal.  Events are pushed into it by backend
/// services through the IHubContext&lt;GlobalHub&gt; injected into their event handlers.
/// </summary>
public class GlobalHub : Hub
{
    /// <summary>
    /// Adds the caller to a named broadcast group (e.g. "dashboard").
    /// </summary>
    public Task JoinGroup(string groupName) =>
        Groups.AddToGroupAsync(Context.ConnectionId, groupName);

    /// <summary>
    /// Removes the caller from a named broadcast group.
    /// </summary>
    public Task LeaveGroup(string groupName) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
}
