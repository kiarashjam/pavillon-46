using System.Text;
using System.Text.RegularExpressions;

namespace Pavillon46.Api.Monitoring;

/// <summary>
/// Takes tokens, secrets and personal data out of what leaves the API for
/// monitoring: telemetry (<see cref="TelemetryRedactionInitializer"/>) and the
/// browser error reports (<c>ClientErrorsController</c>).
/// </summary>
/// <remarks>
/// Tokens travel in query strings here: <c>/api/newsletters/unsubscribe?t=</c>,
/// <c>/api/meetings/invite?token=</c>, and on the site <c>/reset-password?token=</c>
/// and <c>/rendez-vous?invite=</c>. So query values are dropped unless their name is
/// on a short allow-list of harmless filters, rather than the other way round: a
/// new token parameter is redacted without anyone remembering to list it. No
/// route carries a token in its path today; long opaque path segments are
/// redacted anyway, in case one does. Record ids (32 hex characters) are kept.
/// </remarks>
public static class Redaction
{
    public const string Redacted = "redacted";

    // Query parameters whose values are filters, never secrets or people.
    private static readonly HashSet<string> SafeQueryKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "lang", "from", "to", "type", "status", "limit", "day", "sendEmail",
    };

    // name=value pairs to blank wherever they appear in free text (log
    // messages, stack traces), including relative URLs the URL rule cannot parse.
    private static readonly Regex SecretPair = new(
        @"\b(t|token|invite|key|code|ref|sig|signature|secret|password|pwd|email|phone|apikey|api_key|access_token|id_token)=[^&\s""'<>()#]+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex Bearer = new(@"\bBearer\s+[A-Za-z0-9._~+/=-]+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex AbsoluteUrl = new(@"https?://[^\s""'<>()]+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    // The signed tokens here are base64url(payload).base64url(signature).
    private static readonly Regex SignedToken = new(@"\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]+)?",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    // Same shapes as Privacy/PrivacyHelpers.
    private static readonly Regex EmailLike = new(@"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PhoneLike = new(@"(?:\+|00)\d[\d\s().-]{8,}\d\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// An absolute URL with its query values redacted (except harmless filters),
    /// no fragment, and token-like path segments redacted. Anything that does
    /// not parse as one is treated as a path.
    /// </summary>
    public static string Url(string? value, bool keepQuery = true)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return PathAndQuery(value, keepQuery);
        }
        var sb = new StringBuilder();
        sb.Append(uri.Scheme).Append("://").Append(uri.Host);
        if (!uri.IsDefaultPort) sb.Append(':').Append(uri.Port);
        sb.Append(Path(uri.AbsolutePath));
        if (keepQuery) sb.Append(Query(uri.Query));
        return sb.ToString();
    }

    /// <summary><see cref="Url(string?, bool)"/> for a <see cref="Uri"/>; null stays null.</summary>
    public static Uri? Url(Uri? uri)
    {
        if (uri is null) return null;
        var safe = Url(uri.IsAbsoluteUri ? uri.AbsoluteUri : uri.OriginalString);
        return Uri.TryCreate(safe, UriKind.RelativeOrAbsolute, out var result) ? result : null;
    }

    /// <summary>A relative URL or a bare path, redacted the same way.</summary>
    private static string PathAndQuery(string value, bool keepQuery)
    {
        var cut = value.IndexOfAny(new[] { '?', '#' });
        var path = cut < 0 ? value : value[..cut];
        var query = "";
        if (keepQuery && cut >= 0 && value[cut] == '?')
        {
            var hash = value.IndexOf('#', cut);
            query = Query(hash < 0 ? value[cut..] : value[cut..hash]);
        }
        return Path(path) + query;
    }

    /// <summary>Each path segment that looks like a token or an email address is redacted.</summary>
    public static string Path(string? path)
    {
        if (string.IsNullOrEmpty(path)) return path ?? "";
        var segments = path.Split('/');
        for (var i = 0; i < segments.Length; i++)
        {
            var s = segments[i];
            if (s.Length == 0) continue;
            var decoded = Uri.UnescapeDataString(s);
            if (EmailLike.IsMatch(decoded) || LooksLikeToken(decoded)) segments[i] = Redacted;
        }
        return string.Join('/', segments);
    }

    // A reset token is 43 base64url characters and a signed token is longer, with
    // a dot; a record id is 32 hex characters and a date or a word is shorter.
    private static bool LooksLikeToken(string segment) =>
        segment.Length >= 40 || (segment.Length >= 24 && segment.Contains('.') && SignedToken.IsMatch(segment));

    private static string Query(string query)
    {
        if (string.IsNullOrEmpty(query) || query == "?") return "";
        var pairs = query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
        var kept = new List<string>(pairs.Length);
        foreach (var pair in pairs)
        {
            var eq = pair.IndexOf('=');
            var name = eq < 0 ? pair : pair[..eq];
            if (name.Length > 64) continue;
            kept.Add(SafeQueryKeys.Contains(Uri.UnescapeDataString(name)) ? pair : name + "=" + Redacted);
        }
        return kept.Count == 0 ? "" : "?" + string.Join('&', kept);
    }

    /// <summary>
    /// An operation or dependency name, or a path: when routing matched no
    /// template, the SDK names a request after its raw path ("GET /api/x/…"),
    /// so the path is redacted as in a URL, then the whole as <see cref="Text"/>.
    /// </summary>
    public static string Name(string? name)
    {
        if (string.IsNullOrEmpty(name)) return name ?? "";
        var space = name.IndexOf(' ');
        var target = space < 0 ? name : name[(space + 1)..];
        if (target.StartsWith('/')) name = name[..(space + 1)] + PathAndQuery(target, keepQuery: true);
        return Text(name);
    }

    /// <summary>
    /// Free text (a log message, an exception message, a stack trace): URLs
    /// redacted as above, bearer and signed tokens, secret-looking name=value
    /// pairs, email addresses and phone numbers replaced.
    /// </summary>
    public static string Text(string? text)
    {
        if (string.IsNullOrEmpty(text)) return text ?? "";
        var s = AbsoluteUrl.Replace(text, m => Url(m.Value));
        s = Bearer.Replace(s, "Bearer " + Redacted);
        s = SecretPair.Replace(s, m => m.Groups[1].Value + "=" + Redacted);
        // Namespaces such as Microsoft.Extensions.DependencyInjection have the
        // same shape as a signed token, but no digits.
        s = SignedToken.Replace(s, m => m.Value.Any(char.IsDigit) ? Redacted : m.Value);
        s = EmailLike.Replace(s, "[email]");
        s = PhoneLike.Replace(s, "[phone]");
        return s;
    }

    /// <summary>At most <paramref name="max"/> characters, trimmed; empty for null.</summary>
    public static string Cap(string? value, int max)
    {
        var s = (value ?? "").Trim();
        return s.Length <= max ? s : s[..max];
    }
}
