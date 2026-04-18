using HealthQCopilot.Domain.Primitives;

namespace HealthQCopilot.Domain.Identity;

public enum UserRole { Patient, Practitioner, Admin, System }

public class UserAccount : AggregateRoot<Guid>
{
    public string ExternalId { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string DisplayName { get; private set; } = string.Empty;
    public UserRole Role { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; }
    public DateTime? LastLoginAt { get; private set; }

    private UserAccount() { }

    public static UserAccount Create(Guid id, string externalId, string email, string displayName, UserRole role)
    {
        return new UserAccount
        {
            Id = id,
            ExternalId = externalId,
            Email = email,
            DisplayName = displayName,
            Role = role,
            CreatedAt = DateTime.UtcNow
        };
    }

    public void RecordLogin() => LastLoginAt = DateTime.UtcNow;
    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
    public void UpdateProfile(string email, string displayName)
    {
        Email = email;
        DisplayName = displayName;
    }
}
