using FluentValidation;
using HealthQCopilot.Identity.Endpoints;

namespace HealthQCopilot.Identity.Validators;

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.ExternalId).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Role).IsInEnum();
    }
}

public sealed class RegisterPatientRequestValidator : AbstractValidator<RegisterPatientRequest>
{
    public RegisterPatientRequestValidator()
    {
        RuleFor(x => x.ExternalId).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(256);
    }
}

public sealed class BreakGlassRequestValidator : AbstractValidator<BreakGlassRequest>
{
    public BreakGlassRequestValidator()
    {
        RuleFor(x => x.RequestedByUserId).NotEmpty();
        RuleFor(x => x.TargetPatientId).NotEmpty().MaximumLength(256);
        RuleFor(x => x.ClinicalJustification).NotEmpty().MinimumLength(10).MaximumLength(2000);
        RuleFor(x => x.DurationHours).InclusiveBetween(1, 8).When(x => x.DurationHours.HasValue);
    }
}

public sealed class GrantConsentRequestValidator : AbstractValidator<GrantConsentRequest>
{
    public GrantConsentRequestValidator()
    {
        RuleFor(x => x.PatientUserId).NotEmpty();
        RuleFor(x => x.Purpose).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Scope).NotEmpty().MaximumLength(512);
        RuleFor(x => x.PolicyVersion).NotEmpty().MaximumLength(20);
        RuleFor(x => x.ExpiresAt).GreaterThan(DateTime.UtcNow).When(x => x.ExpiresAt.HasValue);
        RuleFor(x => x.JurisdictionCode).MaximumLength(10).When(x => x.JurisdictionCode is not null);
    }
}

public sealed class ErasureRequestValidator : AbstractValidator<ErasureRequest>
{
    public ErasureRequestValidator()
    {
        RuleFor(x => x.PatientUserId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MinimumLength(10).MaximumLength(1000);
    }
}

public sealed class ProvisionTenantRequestValidator : AbstractValidator<ProvisionTenantRequest>
{
    public ProvisionTenantRequestValidator()
    {
        RuleFor(x => x.OrganisationName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Slug).NotEmpty().Matches("^[a-z0-9-]{3,64}$")
            .WithMessage("Slug must be 3-64 lowercase alphanumeric characters or hyphens.");
        RuleFor(x => x.AdminEmail).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.AdminDisplayName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Locale).NotEmpty().MaximumLength(10);
        RuleFor(x => x.DataRegion).NotEmpty().MaximumLength(50);
    }
}
