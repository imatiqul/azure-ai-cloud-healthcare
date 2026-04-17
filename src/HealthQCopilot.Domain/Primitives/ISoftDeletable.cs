namespace HealthQCopilot.Domain.Primitives;

/// <summary>
/// Entities implementing this interface are soft-deleted instead of physically removed.
/// The SoftDeleteInterceptor converts Delete to Modified with IsDeleted=true.
/// </summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; }
    DateTime? DeletedAt { get; }
}
