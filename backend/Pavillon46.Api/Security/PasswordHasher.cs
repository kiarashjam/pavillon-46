using System.Security.Cryptography;

namespace Pavillon46.Api.Security;

/// <summary>
/// PBKDF2 (SHA-256) password hashing plus helpers for generating member
/// credentials and referral codes. No external dependencies.
/// </summary>
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 100_000;
    private const char Delimiter = '.';

    // Unambiguous alphabet (no 0/O, 1/I/l) for human-friendly codes & passwords.
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const string PasswordAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return string.Join(Delimiter, "v1", Iterations, Convert.ToBase64String(salt), Convert.ToBase64String(key));
    }

    public static bool Verify(string password, string stored)
    {
        if (string.IsNullOrEmpty(stored)) return false;
        var parts = stored.Split(Delimiter);
        if (parts.Length != 4 || parts[0] != "v1") return false;
        if (!int.TryParse(parts[1], out var iterations)) return false;

        byte[] salt;
        byte[] expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    /// <summary>Generates a readable temporary password, e.g. "Kp7x-Rm4n-Qe9t".</summary>
    public static string GeneratePassword()
    {
        var groups = new[] { Pick(4), Pick(4), Pick(4) };
        return string.Join("-", groups);

        static string Pick(int n)
        {
            var chars = new char[n];
            for (var i = 0; i < n; i++)
            {
                chars[i] = PasswordAlphabet[RandomNumberGenerator.GetInt32(PasswordAlphabet.Length)];
            }
            return new string(chars);
        }
    }

    /// <summary>Generates a member referral code, e.g. "PAV-7KQM9X".</summary>
    public static string GenerateReferralCode() => "PAV-" + RandomToken(6);

    /// <summary>Generates a per-application reference, e.g. "APP-3F8K2D".</summary>
    public static string GenerateApplicationCode() => "APP-" + RandomToken(6);

    private static string RandomToken(int n)
    {
        var chars = new char[n];
        for (var i = 0; i < n; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return new string(chars);
    }
}
