using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Security;

public interface ITokenService
{
    (string Token, DateTimeOffset ExpiresAt) Create(Member member);
    (string Token, DateTimeOffset ExpiresAt) CreateForAdmin(Admin admin);
    MemberPrincipal? Validate(string? token);
}

/// <summary>
/// Compact, dependency-free signed token: base64url(payload).base64url(HMACSHA256).
/// Stateless — the payload carries the member id, email, role and expiry.
/// </summary>
public class TokenService : ITokenService
{
    private readonly AuthOptions _options;

    public TokenService(IOptions<AuthOptions> options)
    {
        _options = options.Value;
    }

    private sealed class TokenPayload
    {
        public string Sub { get; set; } = "";
        public string Email { get; set; } = "";
        public string Role { get; set; } = "member";
        public long Exp { get; set; }
        // Snapshot of Member.PasswordVersion at issuance. 0 for admins (they use
        // a separate identity and don't participate in the version check).
        public int Pv { get; set; }
    }

    public (string Token, DateTimeOffset ExpiresAt) Create(Member member) =>
        Issue(member.Id, member.Email, member.Role, member.PasswordVersion);

    // Admins are a separate identity (see AdminStore); their token always carries
    // role "admin" so [AdminAuthorize] can distinguish them from members.
    public (string Token, DateTimeOffset ExpiresAt) CreateForAdmin(Admin admin) =>
        Issue(admin.Id, admin.Email, "admin", 0);

    private (string Token, DateTimeOffset ExpiresAt) Issue(string sub, string email, string role, int passwordVersion)
    {
        var expires = DateTimeOffset.UtcNow.AddHours(Math.Max(1, _options.TokenTtlHours));
        var payload = new TokenPayload
        {
            Sub = sub,
            Email = email,
            Role = string.IsNullOrEmpty(role) ? "member" : role,
            Exp = expires.ToUnixTimeSeconds(),
            Pv = passwordVersion,
        };

        var payloadJson = JsonSerializer.SerializeToUtf8Bytes(payload);
        var payloadSegment = Base64Url(payloadJson);
        var signature = Sign(payloadSegment);
        return ($"{payloadSegment}.{signature}", expires);
    }

    public MemberPrincipal? Validate(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var parts = token.Split('.');
        if (parts.Length != 2) return null;

        var expectedSig = Sign(parts[0]);
        if (!FixedTimeEquals(parts[1], expectedSig)) return null;

        TokenPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<TokenPayload>(FromBase64Url(parts[0]));
        }
        catch (Exception)
        {
            return null;
        }

        if (payload is null || string.IsNullOrEmpty(payload.Sub)) return null;
        if (DateTimeOffset.FromUnixTimeSeconds(payload.Exp) < DateTimeOffset.UtcNow) return null;

        return new MemberPrincipal
        {
            MemberId = payload.Sub,
            Email = payload.Email,
            Role = string.IsNullOrEmpty(payload.Role) ? "member" : payload.Role,
            PasswordVersion = payload.Pv,
        };
    }

    private string Sign(string payloadSegment)
    {
        var key = Encoding.UTF8.GetBytes(_options.TokenSecret);
        var hash = HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(payloadSegment));
        return Base64Url(hash);
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        var ab = Encoding.ASCII.GetBytes(a);
        var bb = Encoding.ASCII.GetBytes(b);
        if (ab.Length != bb.Length) return false;
        return CryptographicOperations.FixedTimeEquals(ab, bb);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch
        {
            2 => padded + "==",
            3 => padded + "=",
            _ => padded,
        };
        return Convert.FromBase64String(padded);
    }
}
