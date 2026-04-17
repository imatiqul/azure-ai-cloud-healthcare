using FluentValidation;
using HealthQCopilot.Voice.Endpoints;

namespace HealthQCopilot.Voice.Validators;

public sealed class CreateSessionRequestValidator : AbstractValidator<CreateSessionRequest>
{
    public CreateSessionRequestValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class ProduceTranscriptRequestValidator : AbstractValidator<ProduceTranscriptRequest>
{
    public ProduceTranscriptRequestValidator()
    {
        RuleFor(x => x.TranscriptText).NotEmpty().MaximumLength(100_000);
    }
}
