namespace HealthQCopilot.Fhir.Hl7v2;

/// <summary>
/// Contract for processing a raw HL7 v2 message and returning an ACK/NAK string.
/// </summary>
public interface IHl7v2MessageHandler
{
    /// <summary>
    /// Handles a raw HL7 v2 message payload.
    /// </summary>
    /// <param name="messageBytes">Raw HL7 v2 message bytes (UTF-8, segments separated by \r).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>
    /// HL7 v2 ACK or NAK response string to send back to the sender.
    /// </returns>
    Task<string> HandleAsync(byte[] messageBytes, CancellationToken ct);
}
