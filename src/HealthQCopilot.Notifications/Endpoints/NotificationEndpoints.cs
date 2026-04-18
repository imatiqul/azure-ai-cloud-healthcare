using HealthQCopilot.Domain.Notifications;
using HealthQCopilot.Infrastructure.Validation;
using HealthQCopilot.Notifications.Infrastructure;
using HealthQCopilot.Notifications.Services;
using Microsoft.EntityFrameworkCore;

namespace HealthQCopilot.Notifications.Endpoints;

public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/notifications")
            .WithTags("Notifications")
            .WithAutoValidation();

        group.MapPost("/campaigns", async (
            CreateCampaignRequest request,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var campaign = OutreachCampaign.Create(Guid.NewGuid(), request.Name, request.Type, string.Join(",", request.TargetPatientIds));
            db.OutreachCampaigns.Add(campaign);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/notifications/campaigns/{campaign.Id}",
                new { campaign.Id, Status = campaign.Status.ToString() });
        });

        group.MapPost("/campaigns/{id:guid}/activate", async (
            Guid id,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var campaign = await db.OutreachCampaigns.FindAsync([id], ct);
            if (campaign is null) return Results.NotFound();
            campaign.Activate(DateTime.UtcNow);

            // Create messages for each target patient
            var patientIds = campaign.TargetCriteria.Split(',', StringSplitOptions.RemoveEmptyEntries);
            foreach (var patientId in patientIds)
            {
                var message = Message.Create(campaign.Id, patientId.Trim(),
                    MessageChannel.Email, $"Campaign: {campaign.Name}");
                db.Messages.Add(message);
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { campaign.Id, Status = campaign.Status.ToString(), MessagesCreated = patientIds.Length });
        });

        group.MapPost("/messages/{id:guid}/send", async (
            Guid id,
            NotificationDbContext db,
            INotificationSender sender,
            CancellationToken ct) =>
        {
            var message = await db.Messages.FindAsync([id], ct);
            if (message is null) return Results.NotFound();
            await sender.SendAsync(message, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message.Id, Status = message.Status.ToString() });
        });

        group.MapGet("/campaigns", async (
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var campaigns = await db.OutreachCampaigns
                .OrderByDescending(c => c.CreatedAt).Take(50)
                .Select(c => new { c.Id, c.Name, Type = c.Type.ToString(), Status = c.Status.ToString(), c.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(campaigns);
        });

        group.MapGet("/messages", async (
            Guid? campaignId,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Messages.AsQueryable();
            if (campaignId.HasValue)
                query = query.Where(m => m.CampaignId == campaignId.Value);
            var messages = await query.OrderByDescending(m => m.CreatedAt).Take(100)
                .Select(m => new { m.Id, m.CampaignId, Channel = m.Channel.ToString(), Status = m.Status.ToString(), m.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(messages);
        });

        return app;
    }
}

public record CreateCampaignRequest(string Name, CampaignType Type, List<Guid> TargetPatientIds);
