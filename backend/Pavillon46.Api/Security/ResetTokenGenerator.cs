using System.Security.Cryptography;
using System.Text;

namespace Pavillon46.Api.Security;

/// <summary>
/// Random-token helpers for the password-reset flow. The raw token is 32 bytes
/// (256 bits) of cryptographic entropy, base64url-encoded so it is safe as a
/// URL query parameter. Only the SHA-256 hex-lowercase digest is ever stored;
/// the raw value lives only in the outgoing reset email.
/// </summary>
public static class ResetTokenGenerator
{
    private const int TokenBytes = 32;

    /// <summary>Generates a fresh random base64url token (~43 chars).</summary>
    public static string GenerateRaw()
    {
        var bytes = RandomNumberGenerator.GetBytes(TokenBytes);
        return Base64Url(bytes);
    }

    /// <summary>Hex-lowercase SHA-256 of the UTF-8 bytes of the raw token.</summary>
    public static string Hash(string raw)
    {
        if (raw is null) throw new ArgumentNullException(nameof(raw));
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    /// <summary>Constant-time equality of two hex-lowercase hashes.</summary>
    public static bool HashesEqual(string a, string b)
    {
        if (a is null || b is null) return false;
        var ab = Encoding.UTF8.GetBytes(a);
        var bb = Encoding.UTF8.GetBytes(b);
        if (ab.Length != bb.Length) return false;
        return CryptographicOperations.FixedTimeEquals(ab, bb);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
