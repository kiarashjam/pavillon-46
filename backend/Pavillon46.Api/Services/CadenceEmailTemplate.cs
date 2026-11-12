using System.Net;
using System.Text.RegularExpressions;
using Ganss.Xss;

namespace Pavillon46.Api.Services;

/// <summary>
/// The organisation's own welcome email, as the CadenceE CRM sends it: HTML
/// that a person pasted into the CRM, with the CRM's placeholders already
/// filled and three left for the portal, which alone knows them.
/// </summary>
/// <remarks>
/// That HTML did not come from this code base, so it never reaches an email as
/// it arrived (root AGENTS.md, rule 5): the placeholders are filled with
/// HTML-encoded values first, and the result is then passed through an
/// allow-list sanitizer, so nothing a placeholder or the paste carried can add
/// a script, a form, an event handler or a javascript: link.
/// </remarks>
public static partial class CadenceEmailTemplate
{
    [GeneratedRegex(@"\{\{\s*(?<key>setPasswordUrl|portalUrl|loginEmail)\s*(?:\|(?<fallback>[^{}]*))?\}\}",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PortalPlaceholder();

    /// <summary>The values only the portal knows.</summary>
    public sealed record PortalValues(string SetPasswordUrl, string PortalUrl, string LoginEmail);

    /// <summary>
    /// Fills <c>{{setPasswordUrl}}</c>, <c>{{portalUrl}}</c> and
    /// <c>{{loginEmail}}</c>, HTML-encoded when <paramref name="html"/> is set.
    /// </summary>
    public static string Fill(string template, PortalValues values, bool html) =>
        PortalPlaceholder().Replace(template, match =>
        {
            var value = match.Groups["key"].Value.ToLowerInvariant() switch
            {
                "setpasswordurl" => values.SetPasswordUrl,
                "portalurl" => values.PortalUrl,
                _ => values.LoginEmail,
            };
            if (string.IsNullOrEmpty(value) && match.Groups["fallback"].Success) value = match.Groups["fallback"].Value.Trim();
            return html ? WebUtility.HtmlEncode(value) : value;
        });

    /// <summary>A subject line: placeholders filled, one line, at most 200 characters.</summary>
    public static string Subject(string template, PortalValues values)
    {
        var line = Fill(template, values, html: false).Replace("\r", " ").Replace("\n", " ").Trim();
        return line.Length <= 200 ? line : line[..200];
    }

    [GeneratedRegex("style=\"[^\"]*\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StyleAttribute();

    [GeneratedRegex(@"rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), 1\)", RegexOptions.CultureInvariant)]
    private static partial Regex OpaqueRgba();

    private static readonly HtmlSanitizer Sanitizer = Build();

    private static HtmlSanitizer Build()
    {
        var sanitizer = new HtmlSanitizer();

        // Nothing interactive: an email is read, not filled in.
        foreach (var tag in new[]
        {
            "form", "input", "button", "select", "option", "optgroup", "textarea", "label", "fieldset", "legend",
            "datalist", "output", "keygen", "menu", "menuitem", "details", "summary", "map", "area",
        })
        {
            sanitizer.AllowedTags.Remove(tag);
        }

        // The layout attributes email designs are built with.
        foreach (var attribute in new[] { "align", "valign", "bgcolor", "background", "width", "height", "border", "cellpadding", "cellspacing", "role" })
        {
            sanitizer.AllowedAttributes.Add(attribute);
        }

        sanitizer.AllowDataAttributes = false;
        sanitizer.AllowedSchemes.Clear();
        sanitizer.AllowedSchemes.Add("http");
        sanitizer.AllowedSchemes.Add("https");
        sanitizer.AllowedSchemes.Add("mailto");

        // Images only from https: a plain-http image is a mixed-content warning
        // in most clients, and a data: one is how a payload hides in a picture.
        sanitizer.FilterUrl += (_, e) =>
        {
            var url = e.SanitizedUrl ?? "";
            var isImage = string.Equals(e.Tag.NodeName, "IMG", StringComparison.OrdinalIgnoreCase)
                || string.Equals(e.Tag.NodeName, "TABLE", StringComparison.OrdinalIgnoreCase)
                || string.Equals(e.Tag.NodeName, "TD", StringComparison.OrdinalIgnoreCase);
            if (isImage && !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) e.SanitizedUrl = null;
        };
        return sanitizer;
    }

    /// <summary>
    /// The HTML with only what the allow-list keeps. A whole document stays a
    /// whole document (its head emptied: no meta refresh, no style block), a
    /// fragment stays a fragment.
    /// </summary>
    public static string Sanitize(string html)
    {
        var isDocument = html.Contains("<html", StringComparison.OrdinalIgnoreCase)
            || html.Contains("<body", StringComparison.OrdinalIgnoreCase);
        var clean = isDocument ? Sanitizer.SanitizeDocument(html) : Sanitizer.Sanitize(html);
        // The sanitiser re-writes every colour in a style as rgba(r, g, b, 1),
        // which older Outlook versions do not draw. Opaque ones go back to hex.
        return StyleAttribute().Replace(clean, style => OpaqueRgba().Replace(style.Value, c =>
            "#" + string.Concat(Enumerable.Range(1, 3).Select(i => Math.Min(255, int.Parse(c.Groups[i].Value)).ToString("x2")))));
    }
}
