using System.Text.RegularExpressions;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Privacy;

public static class PrivacyHelpers
{
    private static readonly Regex EmailLike = new(@"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex PhoneLike = new(@"(?:\+|00)\d[\d\s().-]{8,}\d\b",
        RegexOptions.Compiled);

    private static readonly Regex Hostname = new(@"^[a-z0-9.-]+\.[a-z]{2,}$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static string PublicReferrer(string? referrer)
    {
        var r = (referrer ?? "").Trim();
        if (r.Length == 0) return "";
        if (r == "internal") return r;

        if (Uri.TryCreate(r, UriKind.Absolute, out var u))
        {
            return (u.Host ?? "").ToLowerInvariant();
        }

        return Hostname.IsMatch(r) ? r.ToLowerInvariant() : "";
    }

    public static string PublicClickText(string? text, int maxLen = 48)
    {
        var s = (text ?? "").Trim();
        s = Regex.Replace(s, @"\s+", " ");
        s = EmailLike.Replace(s, "[redacted]");
        s = PhoneLike.Replace(s, "[redacted]");
        if (s.Length > maxLen)
        {
            return s[..Math.Max(1, maxLen - 1)] + "…";
        }
        return s;
    }

    public static string PublicUserAgent(string? ua, int maxLen = 140)
    {
        var s = (ua ?? "").Trim();
        if (s.Length == 0) return "";
        if (s.Length <= maxLen) return s;
        return s[..Math.Max(1, maxLen - 1)] + "…";
    }

    public static ActivityEvent SanitizeEventForPrivacy(ActivityEvent ev)
    {
        ev.Referrer = PublicReferrer(ev.Referrer);
        ev.UserAgent = PublicUserAgent(ev.UserAgent);
        ev.Element = new ActivityElement
        {
            Tag = ev.Element?.Tag ?? "",
            Id = ev.Element?.Id ?? "",
            Text = PublicClickText(ev.Element?.Text, 48)
        };
        return ev;
    }
}
