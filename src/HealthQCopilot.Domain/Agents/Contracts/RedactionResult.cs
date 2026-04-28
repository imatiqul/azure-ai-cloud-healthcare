namespace HealthQCopilot.Domain.Agents.Contracts;

/// <summary>
/// Result of a PHI redaction pass. <see cref="RedactedText"/> is what is sent to
/// the LLM; <see cref="TokenMap"/> allows reversible re-hydration of the model
/// output before showing it to the clinician.
/// </summary>
public sealed record RedactionResult(
    string RedactedText,
    IReadOnlyDictionary<string, string> TokenMap,
    IReadOnlyList<RedactionEntity> Entities,
    string Strategy,           // presidio | medical-ner | regex-fallback | none
    bool ResidualPhiSuspected);

public sealed record RedactionEntity(
    string EntityType,         // PERSON | MRN | DOB | SSN | PHONE | ADDR | EMAIL | DEVICE_ID | DIAGNOSIS_NAME
    int Start,
    int End,
    double Score,
    string Token);             // e.g. <PHI:NAME_1>
