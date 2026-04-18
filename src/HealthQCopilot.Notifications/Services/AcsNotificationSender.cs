using Azure.Communication.Email;
using Azure.Communication.Sms;
using HealthQCopilot.Domain.Notifications;

namespace HealthQCopilot.Notifications.Services;

public sealed class AcsNotificationSender : INotificationSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<AcsNotificationSender> _logger;

    public AcsNotificationSender(IConfiguration config, ILogger<AcsNotificationSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task<bool> SendAsync(Message message, CancellationToken ct)
    {
        var connectionString = _config["AzureCommunication:ConnectionString"];

        if (string.IsNullOrEmpty(connectionString) || string.IsNullOrEmpty(message.RecipientAddress))
        {
            _logger.LogWarning(
                "ACS not configured or recipient address missing; simulating send for message {MessageId} via {Channel}",
                message.Id, message.Channel);
            message.MarkSent();
            return true;
        }

        try
        {
            switch (message.Channel)
            {
                case MessageChannel.Email:
                    await SendEmailAsync(connectionString, message, ct);
                    break;
                case MessageChannel.Sms:
                    await SendSmsAsync(connectionString, message, ct);
                    break;
                default:
                    _logger.LogWarning("Channel {Channel} not supported yet", message.Channel);
                    return false;
            }

            message.MarkSent();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message {MessageId}", message.Id);
            message.MarkFailed();
            return false;
        }
    }

    private async Task SendEmailAsync(string connectionString, Message message, CancellationToken ct)
    {
        var client = new EmailClient(connectionString);
        var senderAddress = _config["AzureCommunication:SenderEmail"]
            ?? "DoNotReply@healthqcopilot.com";

        await client.SendAsync(
            Azure.WaitUntil.Started,
            senderAddress,
            message.RecipientAddress!,
            $"HealthQ Copilot - {message.Channel}",
            message.Content,
            cancellationToken: ct);
    }

    private async Task SendSmsAsync(string connectionString, Message message, CancellationToken ct)
    {
        var client = new SmsClient(connectionString);
        var senderPhone = _config["AzureCommunication:SenderPhone"] ?? "+18005551234";

        await client.SendAsync(senderPhone, message.RecipientAddress!, message.Content, cancellationToken: ct);
    }
}
