namespace HealthQCopilot.Domain.Primitives;

/// <summary>
/// Marker interface for entities that support automatic audit timestamps.
/// Interceptor sets ModifiedAt on SaveChanges when entity state is Modified.
/// </summary>
public interface IAuditable
{
    DateTime CreatedAt { get; }
    DateTime? ModifiedAt { get; }
}
