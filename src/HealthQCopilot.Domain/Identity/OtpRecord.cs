namespace HealthQCopilot.Domain.Identity;

/// <summary>
/// One-time password record for patient MFA enrollment and phone verification.
/// Codes are single-use and expire after <see cref="TtlMinutes"/> minutes.
/// </summary>
public sealed class OtpRecord
{
    private const int TtlMinutes = 10;
    private const int CodeLength = 6;

    public Guid Id { get; private set; }

    /// <summary>E.164 phone number the OTP was sent to.</summary>
    public string PhoneNumber { get; private set; } = default!;

    /// <summary>SHA-256 hex digest of the raw 6-digit code.</summary>
    public string CodeHash { get; private set; } = default!;

    public DateTime ExpiresAt { get; private set; }
    public bool IsUsed { get; private set; }
    public DateTime CreatedAt { get; private set; }

    /// <summary>Optional: identity of the user requesting the OTP (for audit).</summary>
    public Guid? UserId { get; private set; }

    private OtpRecord() { }

    /// <summary>
    /// Generates a new 6-digit OTP for the given phone number.
    /// Returns both the entity (to persist) and the plaintext code (to send via SMS).
    /// </summary>
    public static (OtpRecord record, string plainCode) Create(string phoneNumber, Guid? userId = null)
    {
        var code = GenerateCode();
        var record = new OtpRecord
        {
            Id = Guid.NewGuid(),
            PhoneNumber = phoneNumber,
            CodeHash = ComputeHash(code),
            ExpiresAt = DateTime.UtcNow.AddMinutes(TtlMinutes),
            IsUsed = false,
            CreatedAt = DateTime.UtcNow,
            UserId = userId,
        };
        return (record, code);
    }

    /// <summary>Marks the OTP as used. Call only after successful verification.</summary>
    public void MarkUsed() => IsUsed = true;

    /// <summary>Returns true if the provided code matches and the OTP has not expired or been used.</summary>
    public bool Verify(string candidateCode) =>
        !IsUsed
        && DateTime.UtcNow <= ExpiresAt
        && ComputeHash(candidateCode) == CodeHash;

    private static string GenerateCode()
    {
        // Cryptographically random 6-digit code — avoids weak System.Random
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(4);
        var value = BitConverter.ToUInt32(bytes, 0) % 1_000_000;
        return value.ToString("D6");
    }

    private static string ComputeHash(string code)
    {
        var digest = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(code));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}
