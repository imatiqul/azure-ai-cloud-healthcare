using FluentValidation;
using HealthQCopilot.Notifications.Endpoints;

namespace HealthQCopilot.Notifications.Validators;

public sealed class CreateCampaignRequestValidator : AbstractValidator<CreateCampaignRequest>
{
    public CreateCampaignRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.TargetPatientIds).NotEmpty();
        RuleForEach(x => x.TargetPatientIds).NotEmpty();
    }
}
