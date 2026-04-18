using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace HealthQCopilot.Infrastructure.Security;

/// <summary>
/// PHI field-level encryption using AES-256-GCM.
/// The encryption key is sourced exclusively via Dapr Secrets (Azure Key Vault).
/// Encrypted payloads are stored as Base64: [12-byte nonce][16-byte tag][ciphertext].
/// </summary>
public sealed class PhiEncryptedString
{
    private const int NonceSizeBytes = 12;
    private const int TagSizeBytes = 16;

    private readonly byte[] _ciphertext;
    private readonly byte[] _nonce;
    private readonly byte[] _tag;

    private PhiEncryptedString(byte[] nonce, byte[] tag, byte[] ciphertext)
    {
        _nonce = nonce;
        _tag = tag;
        _ciphertext = ciphertext;
    }

    /// <summary>Creates an encrypted PHI string from plaintext.</summary>
    public static PhiEncryptedString Protect(string plaintext, ReadOnlySpan<byte> key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(plaintext);
        if (key.Length != 32)
            throw new ArgumentException("AES-256 key must be exactly 32 bytes.", nameof(key));

        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = new byte[NonceSizeBytes];
        var tag = new byte[TagSizeBytes];
        var ciphertext = new byte[plaintextBytes.Length];

        RandomNumberGenerator.Fill(nonce);

        using var aes = new AesGcm(key, TagSizeBytes);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        return new PhiEncryptedString(nonce, tag, ciphertext);
    }

    /// <summary>Decrypts and returns the plaintext PHI value.</summary>
    public string Reveal(ReadOnlySpan<byte> key)
    {
        if (key.Length != 32)
            throw new ArgumentException("AES-256 key must be exactly 32 bytes.", nameof(key));

        var plaintext = new byte[_ciphertext.Length];
        using var aes = new AesGcm(key, TagSizeBytes);
        aes.Decrypt(_nonce, _ciphertext, _tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }

    /// <summary>Serialises to a single Base64 string for database storage.</summary>
    public string ToStorageString()
    {
        var combined = new byte[NonceSizeBytes + TagSizeBytes + _ciphertext.Length];
        _nonce.CopyTo(combined.AsSpan(0));
        _tag.CopyTo(combined.AsSpan(NonceSizeBytes));
        _ciphertext.CopyTo(combined.AsSpan(NonceSizeBytes + TagSizeBytes));
        return Convert.ToBase64String(combined);
    }

    /// <summary>Deserialises from storage string.</summary>
    public static PhiEncryptedString FromStorageString(string storageValue)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageValue);
        var combined = Convert.FromBase64String(storageValue);
        var nonce = combined[..NonceSizeBytes];
        var tag = combined[NonceSizeBytes..(NonceSizeBytes + TagSizeBytes)];
        var ciphertext = combined[(NonceSizeBytes + TagSizeBytes)..];
        return new PhiEncryptedString(nonce, tag, ciphertext);
    }

    public override string ToString() => "[PHI ENCRYPTED]";
}
