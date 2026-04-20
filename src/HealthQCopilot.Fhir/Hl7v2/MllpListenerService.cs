using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Fhir.Hl7v2;

/// <summary>
/// Minimal MLLP (Minimal Lower Layer Protocol) TCP listener on port 2575.
/// Receives HL7 v2 messages wrapped in MLLP framing:
///   0x0B  [HL7 message bytes]  0x1C 0x0D
///
/// Each received message is handed to the injected <see cref="IHl7v2MessageHandler"/>.
/// The server sends back an ACK or NAK MLLP-framed response.
/// </summary>
public sealed class MllpListenerService(
    IHl7v2MessageHandler handler,
    ILogger<MllpListenerService> logger,
    int port = 2575) : BackgroundService
{
    // MLLP framing bytes per HL7 Appendix C
    private const byte StartBlock = 0x0B;
    private const byte EndBlock = 0x1C;
    private const byte CarriageReturn = 0x0D;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var listener = new TcpListener(IPAddress.Any, port);
        listener.Start();
        logger.LogInformation("MLLP listener started on TCP port {Port}", port);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                TcpClient client;
                try
                {
                    client = await listener.AcceptTcpClientAsync(stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                // Handle each connection on a separate Task (fire-and-forget with structured logging)
                _ = HandleClientAsync(client, stoppingToken);
            }
        }
        finally
        {
            listener.Stop();
            logger.LogInformation("MLLP listener stopped");
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
    {
        var remote = client.Client.RemoteEndPoint;
        logger.LogDebug("MLLP: accepted connection from {Remote}", remote);

        using var clientOwner = client;
        await using var stream = client.GetStream();

        try
        {
            while (!ct.IsCancellationRequested)
            {
                var hl7Message = await ReadMllpMessageAsync(stream, ct);
                if (hl7Message is null) break; // connection closed

                logger.LogDebug("MLLP: received {Bytes} bytes from {Remote}", hl7Message.Length, remote);

                byte[] response;
                try
                {
                    var ackText = await handler.HandleAsync(hl7Message, ct);
                    response = WrapMllp(Encoding.UTF8.GetBytes(ackText));
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "MLLP: error processing message from {Remote}", remote);
                    var nak = BuildNak("AE", "Internal processing error");
                    response = WrapMllp(Encoding.UTF8.GetBytes(nak));
                }

                await stream.WriteAsync(response, ct);
                await stream.FlushAsync(ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "MLLP: connection error from {Remote}", remote);
        }
    }

    /// <summary>Reads one MLLP-framed HL7 message from the stream.</summary>
    private static async Task<byte[]?> ReadMllpMessageAsync(NetworkStream stream, CancellationToken ct)
    {
        // Read until StartBlock
        var header = new byte[1];
        while (true)
        {
            var n = await stream.ReadAsync(header.AsMemory(0, 1), ct);
            if (n == 0) return null; // connection closed
            if (header[0] == StartBlock) break;
        }

        var buffer = new MemoryStream();
        var oneByte = new byte[1];
        byte prev = 0;

        while (true)
        {
            var n = await stream.ReadAsync(oneByte.AsMemory(0, 1), ct);
            if (n == 0) return null;

            if (prev == EndBlock && oneByte[0] == CarriageReturn)
            {
                // Strip the trailing EndBlock already written to buffer
                var data = buffer.ToArray();
                return data[..^1]; // remove EndBlock byte
            }

            buffer.WriteByte(oneByte[0]);
            prev = oneByte[0];
        }
    }

    /// <summary>Wraps a byte payload in MLLP framing.</summary>
    private static byte[] WrapMllp(byte[] payload)
    {
        var result = new byte[payload.Length + 3];
        result[0] = StartBlock;
        Buffer.BlockCopy(payload, 0, result, 1, payload.Length);
        result[^2] = EndBlock;
        result[^1] = CarriageReturn;
        return result;
    }

    /// <summary>Builds a minimal HL7 v2.5 ACK NAK response.</summary>
    public static string BuildNak(string ackCode, string errorText)
    {
        var ts = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        return $"MSH|^~\\&|HEALTHQ|HEALTHQ|EHR|EHR|{ts}||ACK|{ts}|P|2.5\r" +
               $"MSA|{ackCode}|NAK-{ts}|{errorText}\r";
    }
}
