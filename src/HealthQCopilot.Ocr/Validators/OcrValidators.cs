using FluentValidation;
using HealthQCopilot.Ocr.Endpoints;

namespace HealthQCopilot.Ocr.Validators;

public sealed class CreateOcrJobRequestValidator : AbstractValidator<CreateOcrJobRequest>
{
    public CreateOcrJobRequestValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.DocumentUrl).NotEmpty().MaximumLength(2048)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out _))
            .WithMessage("DocumentUrl must be a valid absolute URI");
        RuleFor(x => x.DocumentType).NotEmpty().MaximumLength(128);
    }
}
