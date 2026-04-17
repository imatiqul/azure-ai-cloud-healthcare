using FluentValidation;
using HealthQCopilot.Scheduling.Endpoints;

namespace HealthQCopilot.Scheduling.Validators;

public sealed class CreateBookingRequestValidator : AbstractValidator<CreateBookingRequest>
{
    public CreateBookingRequestValidator()
    {
        RuleFor(x => x.SlotId).NotEmpty();
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PractitionerId).NotEmpty();
    }
}

public sealed class ReserveSlotRequestValidator : AbstractValidator<ReserveSlotRequest>
{
    public ReserveSlotRequestValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}
