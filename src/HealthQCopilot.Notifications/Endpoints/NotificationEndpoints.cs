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

        // ── Message delivery status ───────────────────────────────────────────
        group.MapGet("/messages/{id:guid}/status", async (
            Guid id,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var message = await db.Messages.FindAsync([id], ct);
            if (message is null) return Results.NotFound();
            return Results.Ok(new
            {
                message.Id,
                message.CampaignId,
                message.PatientId,
                Channel  = message.Channel.ToString(),
                Status   = message.Status.ToString(),
                message.CreatedAt,
                message.SentAt,
            });
        })
        .WithSummary("Get delivery status of a single notification message");

        // ── Delivery analytics ────────────────────────────────────────────────
        group.MapGet("/analytics/delivery", async (
            Guid? campaignId,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Messages.AsQueryable();
            if (campaignId.HasValue)
                query = query.Where(m => m.CampaignId == campaignId.Value);

            var messages = await query.ToListAsync(ct);
            var total     = messages.Count;
            var sent      = messages.Count(m => m.Status == MessageStatus.Sent);
            var delivered = messages.Count(m => m.Status == MessageStatus.Delivered);
            var failed    = messages.Count(m => m.Status == MessageStatus.Failed);
            var pending   = messages.Count(m => m.Status == MessageStatus.Pending);

            return Results.Ok(new
            {
                Total         = total,
                Pending       = pending,
                Sent          = sent,
                Delivered     = delivered,
                Failed        = failed,
                DeliveryRate  = total > 0 ? Math.Round((double)delivered / total * 100, 1) : 0,
                FailureRate   = total > 0 ? Math.Round((double)failed    / total * 100, 1) : 0,
            });
        })
        .WithSummary("Delivery analytics — sent/delivered/failed breakdown");

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
            string? patientId,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Messages.AsQueryable();
            if (campaignId.HasValue)
                query = query.Where(m => m.CampaignId == campaignId.Value);
            if (!string.IsNullOrWhiteSpace(patientId))
                query = query.Where(m => m.PatientId == patientId);
            var messages = await query.OrderByDescending(m => m.CreatedAt).Take(100)
                .Select(m => new { m.Id, m.CampaignId, Channel = m.Channel.ToString(), Status = m.Status.ToString(), m.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(messages);
        });

        // ── Web Push subscription management ──────────────────────────────────
        // The patient portal calls these to register/unregister browser push tokens.

        group.MapPost("/push-subscriptions", async (
            RegisterPushSubscriptionRequest request,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PatientId)
                || string.IsNullOrWhiteSpace(request.Endpoint)
                || string.IsNullOrWhiteSpace(request.P256dh)
                || string.IsNullOrWhiteSpace(request.Auth))
            {
                return Results.BadRequest(new { error = "PatientId, Endpoint, P256dh and Auth are required" });
            }

            // Idempotent: deactivate any existing subscription for this endpoint
            var existing = await db.WebPushSubscriptions
                .Where(s => s.PatientId == request.PatientId && s.Endpoint == request.Endpoint)
                .ToListAsync(ct);
            foreach (var sub in existing) sub.Deactivate();

            var newSub = WebPushSubscription.Create(request.PatientId, request.Endpoint, request.P256dh, request.Auth);
            db.WebPushSubscriptions.Add(newSub);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/notifications/push-subscriptions/{newSub.Id}",
                new { newSub.Id, newSub.PatientId, newSub.CreatedAt });
        })
        .WithSummary("Register a Web Push subscription for a patient")
        .RequireAuthorization();

        group.MapDelete("/push-subscriptions/{id:guid}", async (
            Guid id,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var sub = await db.WebPushSubscriptions.FindAsync([id], ct);
            if (sub is null) return Results.NotFound();
            sub.Deactivate();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        })
        .WithSummary("Unregister a Web Push subscription")
        .RequireAuthorization();

        group.MapGet("/push-subscriptions", async (
            string patientId,
            NotificationDbContext db,
            CancellationToken ct) =>
        {
            var subs = await db.WebPushSubscriptions
                .Where(s => s.PatientId == patientId && s.IsActive)
                .Select(s => new { s.Id, s.Endpoint, s.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(subs);
        })
        .WithSummary("List active Web Push subscriptions for a patient")
        .RequireAuthorization();

        return app;
    }
}

public record CreateCampaignRequest(string Name, CampaignType Type, List<Guid> TargetPatientIds);
public record RegisterPushSubscriptionRequest(string PatientId, string Endpoint, string P256dh, string Auth);
