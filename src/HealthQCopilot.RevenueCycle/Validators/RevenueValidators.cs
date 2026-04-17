using FluentValidation;
using HealthQCopilot.RevenueCycle.Endpoints;

namespace HealthQCopilot.RevenueCycle.Validators;

public sealed class CreateCodingJobRequestValidator : AbstractValidator<CreateCodingJobRequest>
{
    public CreateCodingJobRequestValidator()
    {
        RuleFor(x => x.EncounterId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.PatientId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.SuggestedCodes).NotEmpty();
        RuleForEach(x => x.SuggestedCodes).NotEmpty().MaximumLength(16);
    }
}

public sealed class ReviewCodingJobRequestValidator : AbstractValidator<ReviewCodingJobRequest>
{
    public ReviewCodingJobRequestValidator()
    {
        RuleFor(x => x.ApprovedCodes).NotEmpty();
        RuleForEach(x => x.ApprovedCodes).NotEmpty().MaximumLength(16);
        RuleFor(x => x.ReviewedBy).NotEmpty().MaximumLength(128);
    }
}

public sealed class CreatePriorAuthRequestValidator : AbstractValidator<CreatePriorAuthRequest>
{
    public CreatePriorAuthRequestValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Procedure).NotEmpty().MaximumLength(512);
        RuleFor(x => x.ProcedureCode).MaximumLength(32);
        RuleFor(x => x.InsurancePayer).MaximumLength(256);
    }
}

public sealed class DenyPriorAuthRequestValidator : AbstractValidator<DenyPriorAuthRequest>
{
    public DenyPriorAuthRequestValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(1024);
    }
}
