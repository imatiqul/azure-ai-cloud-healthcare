using Dapr.Client;
using HealthQCopilot.Domain.Ocr.Events;
using HealthQCopilot.Domain.Primitives;
using MediatR;

namespace HealthQCopilot.Ocr.EventHandlers;

/// <summary>
/// Handles the DocumentProcessed domain event raised when an OCR job
/// successfully extracts and writes a clinical document to FHIR.
///
/// Responsibilities (in-process, post-commit):
///   1. Publish to Dapr pub/sub topic "document.processed" so:
///      - The Revenue Cycle Service can initiate a coding job from the extracted NER codes.
///      - The FHIR Service can refresh any cached DocumentReference views.
///      - Clinicians are notified of newly available results.
/// </summary>
public sealed class DocumentProcessedHandler(
    DaprClient dapr,
    ILogger<DocumentProcessedHandler> logger)
    : INotificationHandler<DomainEventNotification<DocumentProcessed>>
{
    public async Task Handle(
        DomainEventNotification<DocumentProcessed> notification,
        CancellationToken ct)
    {
        var evt = notification.DomainEvent;

        await dapr.PublishEventAsync(
            pubsubName: "pubsub",
            topicName: "document.processed",
            data: new
            {
                JobId = evt.JobId,
                PatientId = evt.PatientId,
                FhirDocumentReferenceId = evt.FhirDocumentReferenceId,
                OccurredAt = evt.OccurredAt
            },
            cancellationToken: ct);

        logger.LogInformation(
            "DocumentProcessed published: JobId={JobId} PatientId={PatientId} FhirDocRef={FhirDocRef}",
            evt.JobId, evt.PatientId, evt.FhirDocumentReferenceId);
    }
}
