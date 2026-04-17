using FluentValidation;
using HealthQCopilot.Agents.Endpoints;

namespace HealthQCopilot.Agents.Validators;

public sealed class StartTriageRequestValidator : AbstractValidator<StartTriageRequest>
{
    public StartTriageRequestValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
        RuleFor(x => x.TranscriptText).NotEmpty().MaximumLength(50_000);
    }
}
