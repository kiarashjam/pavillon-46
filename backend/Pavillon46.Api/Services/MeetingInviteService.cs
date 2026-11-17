using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMeetingInviteService
{
    /// <summary>The invitation a token carries, or null when it is malformed, forged, expired, or the secret is not set.</summary>
    MeetingInvite? Verify(string? token);
}

/// <summary>
/// Checks the personal booking link the CadenceE CRM emails a lead:
/// <c>{bookingPageUrl}?invite={token}</c>, where token is
/// <c>base64url(utf8 JSON) "." base64url(HMAC-SHA256(secret, ascii(first part)))</c>,
/// signed with the onboarding secret both sides already share
/// (<c>CADENCE_ONBOARDING_SECRET</c>). The payload is
/// <c>{ v: 1, o, l, n, e, c, u, x }</c> — organisation, lead, full name, email,
/// booking code, the CRM's public API base URL, expiry in Unix seconds.
/// </summary>
/// <remarks>
/// Fails closed: without the secret, no token is valid. The MAC is compared in
/// constant time before the payload is even decoded.
/// </remarks>
public sealed partial class MeetingInviteService : IMeetingInviteService
{
    private const int MaxTokenLength = 4096;

    private readonly CadenceOptions _cadence;

    public MeetingInviteService(IOptions<CadenceOptions> cadence)
    {
        _cadence = cadence.Value;
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+={0,2}$")]
    private static partial Regex Base64UrlPart();

    public MeetingInvite? Verify(string? token)
    {
        if (!_cadence.IsConfigured()) return null;
        var raw = (token ?? "").Trim();
        if (raw.Length is 0 or > MaxTokenLength) return null;

        var parts = raw.Split('.');
        if (parts.Length != 2 || !Base64UrlPart().IsMatch(parts[0]) || !Base64UrlPart().IsMatch(parts[1])) return null;

        var given = Base64UrlDecode(parts[1]);
        if (given is null) return null;
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(_cadence.OnboardingSecret.Trim()), Encoding.ASCII.GetBytes(parts[0]));
        if (!CryptographicOperations.FixedTimeEquals(expected, given)) return null;

        var payload = Base64UrlDecode(parts[0]);
        if (payload is null) return null;
        try
        {
            using var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("v", out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var version) || version != 1) return null;
            if (!root.TryGetProperty("x", out var x) || x.ValueKind != JsonValueKind.Number || !x.TryGetInt64(out var expiry)) return null;
            if (expiry <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;

            var (first, last) = SplitName(Text(root, "n", 160));
            var email = Text(root, "e", 254);
            return new MeetingInvite(
                OrganizationId: Text(root, "o", 200),
                LeadId: Text(root, "l", 200),
                FirstName: first,
                LastName: last,
                Email: MeetingRules.IsEmail(email) ? email : "",
                Code: Text(root, "c", 40),
                CrmBaseUrl: Text(root, "u", 500),
                ExpiresAt: DateTimeOffset.FromUnixTimeSeconds(Math.Min(expiry, DateTimeOffset.MaxValue.ToUnixTimeSeconds())));
        }
        catch (JsonException)
        {
            return null;
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }

    /// <summary>"Marie-Claire de la Tour" → ("Marie-Claire", "de la Tour").</summary>
    internal static (string First, string Last) SplitName(string full)
    {
        var words = full.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return words.Length == 0 ? ("", "") : (words[0], string.Join(' ', words.Skip(1)));
    }

    private static string Text(JsonElement root, string name, int max)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.String) return "";
        var value = MeetingRules.OneLine(el.GetString());
        return value.Length > max ? value[..max].Trim() : value;
    }

    private static byte[]? Base64UrlDecode(string value)
    {
        var s = value.TrimEnd('=').Replace('-', '+').Replace('_', '/');
        s = (s.Length % 4) switch { 2 => s + "==", 3 => s + "=", 0 => s, _ => "" };
        if (s.Length == 0) return null;
        var buffer = new byte[s.Length * 3 / 4];
        return Convert.TryFromBase64String(s, buffer, out var written) ? buffer[..written] : null;
    }
}
