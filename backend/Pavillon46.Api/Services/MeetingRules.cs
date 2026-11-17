using System.Text.RegularExpressions;

namespace Pavillon46.Api.Services;

/// <summary>Input cleaning and checks for the public booking form.</summary>
public static partial class MeetingRules
{
    public const int MaxNameLength = 80;
    public const int MaxEmailLength = 254;
    public const int MaxPhoneLength = 32;
    public const int MaxMessageLength = 1000;

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"^\+?[0-9 ().\-/]+$")]
    private static partial Regex PhoneShape();

    /// <summary>One line: control characters removed, runs of spaces collapsed, trimmed.</summary>
    public static string OneLine(string? value)
    {
        var text = new string((value ?? "").Where(c => !char.IsControl(c)).ToArray());
        return Spaces().Replace(text, " ").Trim();
    }

    /// <summary>A free-text message: line breaks kept (at most two in a row), other control characters removed.</summary>
    public static string Paragraphs(string? value)
    {
        var text = (value ?? "").Replace("\r\n", "\n").Replace('\r', '\n');
        text = new string(text.Where(c => c == '\n' || !char.IsControl(c)).ToArray());
        text = Regex.Replace(text, "\n{3,}", "\n\n");
        return text.Trim();
    }

    public static bool IsEmail(string? value)
    {
        var v = (value ?? "").Trim();
        if (v.Length is 0 or > MaxEmailLength) return false;
        if (v.Any(c => char.IsControl(c) || char.IsWhiteSpace(c) || c is ',' or ';' or '<' or '>' or '"' or '(' or ')' or '\\')) return false;
        var at = v.IndexOf('@');
        if (at <= 0 || at != v.LastIndexOf('@')) return false;
        var domain = v[(at + 1)..];
        var dot = domain.LastIndexOf('.');
        return dot > 0 && dot < domain.Length - 2 && !domain.Contains("..") && !domain.StartsWith('-');
    }

    /// <summary>6 to 20 digits, written with the usual separators and an optional leading +.</summary>
    public static bool IsPhone(string? value)
    {
        var v = (value ?? "").Trim();
        if (v.Length is 0 or > MaxPhoneLength || !PhoneShape().IsMatch(v)) return false;
        var digits = v.Count(char.IsAsciiDigit);
        return digits is >= 6 and <= 20;
    }
}
