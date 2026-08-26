using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IUnsubscribeTokenService
{
    /// <summary>Stateless HMAC token binding the member id to the "nlus:v1"
    /// unsubscribe domain. Same input always produces the same token.</summary>
    string Create(string memberId);

    /// <summary>Constant-time verify. On success returns true and outputs the
    /// canonical member id extracted from the payload.</summary>
    bool TryValidate(string? token, out string memberId);
}

/// <summary>
/// Signs the per-member unsubscribe link with HMAC-SHA256. The "nlus:v1" purpose
/// prefix isolates this signature domain from the auth JWT — a session token
/// can never be reused to unsubscribe, and rotating <c>NEWSLETTER_UNSUBSCRIBE_SECRET</c>
/// invalidates every mailed link at once. Zero storage — the token is stable
/// per member, so past newsletters keep unsubscribing correctly.
/// </summary>
public class UnsubscribeTokenService : IUnsubscribeTokenService
{
    // Purpose prefix — bumping to "nlus:v2" gives us a future rotation path
    // without breaking already-signed links until we're ready to invalidate.
    private const string Purpose = "nlus:v1";

    // The compile-time defaults, read off fresh option instances so this check
    // tracks Options.cs automatically instead of duplicating the literals.
    private static readonly string DefaultUnsubscribeSecret = new NewsletterOptions().UnsubscribeSecret;
    private static readonly string DefaultTokenSecret = new AuthOptions().TokenSecret;

    private readonly string _secret;
    private readonly bool _secretIsPublic;
    private readonly bool _isDevelopment;
    private readonly ILogger<UnsubscribeTokenService> _logger;

    public UnsubscribeTokenService(
        IOptions<NewsletterOptions> options,
        IOptions<AuthOptions> auth,
        IHostEnvironment environment,
        ILogger<UnsubscribeTokenService> logger)
    {
        _logger = logger;
        _isDevelopment = environment.IsDevelopment();

        // Prefer the dedicated newsletter secret; fall back to the app-wide
        // session secret so a dev box works out of the box.
        var secret = options.Value.UnsubscribeSecret;
        if (string.IsNullOrWhiteSpace(secret)) secret = auth.Value.TokenSecret;
        _secret = secret ?? "";

        // A secret that is empty, or still equal to a default committed to this
        // repository, is public knowledge. Signing with it would let anyone who
        // can read the source mint a valid unsubscribe link for any member id.
        _secretIsPublic =
            string.IsNullOrWhiteSpace(_secret)
            || string.Equals(_secret, DefaultUnsubscribeSecret, StringComparison.Ordinal)
            || string.Equals(_secret, DefaultTokenSecret, StringComparison.Ordinal);

        if (_secretIsPublic && !_isDevelopment)
        {
            _logger.LogCritical(
                "NEWSLETTER_UNSUBSCRIBE_SECRET is not configured (or is still a repo default). "
                + "Newsletter sending is disabled and unsubscribe links will be rejected until a "
                + "unique secret is set. Generate one with: openssl rand -base64 48");
        }
        else if (_secretIsPublic)
        {
            _logger.LogWarning(
                "Using a development unsubscribe secret. Set NEWSLETTER_UNSUBSCRIBE_SECRET before deploying.");
        }
    }

    private byte[] SecretBytes() => Encoding.UTF8.GetBytes(_secret);

    public string Create(string memberId)
    {
        // Fail loudly rather than mailing thousands of forgeable links. The send
        // endpoint surfaces this as a configuration error to the admin.
        if (_secretIsPublic && !_isDevelopment)
        {
            throw new InvalidOperationException(
                "Cannot sign unsubscribe links: NEWSLETTER_UNSUBSCRIBE_SECRET is not configured.");
        }

        var payloadBytes = Encoding.UTF8.GetBytes(memberId ?? "");
        var toSign = Encoding.UTF8.GetBytes(Purpose + (memberId ?? ""));
        var sig = HMACSHA256.HashData(SecretBytes(), toSign);
        return $"{Base64Url(payloadBytes)}.{Base64Url(sig)}";
    }

    public bool TryValidate(string? token, out string memberId)
    {
        memberId = "";

        // Fail closed. Any link that could validate here was signed with a
        // publicly-known secret, so it is indistinguishable from a forgery.
        if (_secretIsPublic && !_isDevelopment)
        {
            _logger.LogError("Rejected an unsubscribe token: unsubscribe secret is not configured.");
            return false;
        }

        if (string.IsNullOrWhiteSpace(token)) return false;

        var parts = token.Split('.');
        if (parts.Length != 2) return false;

        byte[] payload;
        byte[] providedSig;
        try
        {
            payload = FromBase64Url(parts[0]);
            providedSig = FromBase64Url(parts[1]);
        }
        catch (FormatException)
        {
            return false;
        }

        var candidateMember = Encoding.UTF8.GetString(payload);
        var expected = HMACSHA256.HashData(SecretBytes(), Encoding.UTF8.GetBytes(Purpose + candidateMember));
        if (expected.Length != providedSig.Length) return false;
        if (!CryptographicOperations.FixedTimeEquals(expected, providedSig)) return false;

        memberId = candidateMember;
        return !string.IsNullOrEmpty(memberId);
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
