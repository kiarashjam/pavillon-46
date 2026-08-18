using System.Net;

namespace Pavillon46.Api.Localization;

public static class EmailTranslations
{
    public record AdminStrings(
        Func<string, string> Subject,
        string Title,
        string Intro,
        string NameLabel,
        string EmailLabel,
        string PhoneLabel,
        string PostalCodeLabel,
        string HearAboutLabel,
        string LanguageNote,
        string Footer
    );

    public record UserStrings(
        string Subject,
        string Title,
        Func<string, string> Greeting,
        string Body1,
        string Body2,
        string Body3,
        string Closing,
        string Team,
        Func<int, string> Footer,
        string Location,
        string Tagline
    );

    public static AdminStrings Admin(string lang) => lang == "en"
        ? new AdminStrings(
            Subject: name => $"New Waitlist Signup: {name}",
            Title: "New Waitlist Signup",
            Intro: "A new user has joined the waitlist:",
            NameLabel: "Name:",
            EmailLabel: "Email:",
            PhoneLabel: "Phone:",
            PostalCodeLabel: "Postal Code:",
            HearAboutLabel: "How did you hear about us?",
            LanguageNote: "Language chosen: English",
            Footer: "Sent from Pavillon 46 Website System")
        : new AdminStrings(
            Subject: name => $"Nouvelle inscription sur la liste d'attente: {name}",
            Title: "Nouvelle inscription sur la liste d'attente",
            Intro: "Un nouvel utilisateur a rejoint la liste d'attente:",
            NameLabel: "Nom:",
            EmailLabel: "E-mail:",
            PhoneLabel: "Téléphone:",
            PostalCodeLabel: "Code postal:",
            HearAboutLabel: "Comment avez-vous entendu parler de nous ?",
            LanguageNote: "Langue choisie: Français",
            Footer: "Envoyé depuis le système du site Web Pavillon 46");

    public static UserStrings User(string lang) => lang == "en"
        ? new UserStrings(
            Subject: "Welcome to the Pavillon 46 Waitlist",
            Title: "Welcome to Pavillon 46",
            Greeting: name => $"Hello {name},",
            Body1: "Thank you for your interest in <strong>Pavillon 46</strong>. We are delighted to have you join our exclusive waitlist.",
            Body2: "Our team is currently reviewing your application with care. We will contact you very soon with more information about our exclusive membership and next steps.",
            Body3: "In the meantime, stay tuned for our updates. We look forward to welcoming you to this unique experience where life comes in full color.",
            Closing: "With warm regards,",
            Team: "The Pavillon 46 Team",
            Footer: year => $"&copy; {year} Pavillon 46. All rights reserved.",
            Location: "La Croix-sur-Lutry, Switzerland",
            Tagline: "Life in Full Color")
        : new UserStrings(
            Subject: "Bienvenue sur la liste d'attente de Pavillon 46",
            Title: "Bienvenue au Pavillon 46",
            Greeting: name => $"Bonjour {name},",
            Body1: "Merci de votre intérêt pour <strong>Pavillon 46</strong>. Nous sommes ravis de vous compter parmi les membres de notre liste d'attente exclusive.",
            Body2: "Notre équipe examine actuellement votre candidature avec attention. Nous vous contacterons très prochainement avec plus d'informations sur notre adhésion exclusive et les prochaines étapes.",
            Body3: "En attendant, restez à l'écoute de nos actualités. Nous avons hâte de vous accueillir dans cette expérience unique où la vie prend toutes ses couleurs.",
            Closing: "Avec nos meilleures salutations,",
            Team: "L'équipe Pavillon 46",
            Footer: year => $"&copy; {year} Pavillon 46. Tous droits réservés.",
            Location: "La Croix-sur-Lutry, Suisse",
            Tagline: "La vie pleine de couleurs");

    private static readonly Dictionary<string, (string fr, string en)> HearAbout = new()
    {
        ["social"] = ("Réseaux sociaux", "Social media"),
        ["friends"] = ("Famille et amis", "Friends and family"),
        ["press"] = ("Dans la presse", "Press"),
        ["other"] = ("Autre", "Other"),
    };

    public static string FormatHearAboutHtml(string lang, string? hearAboutKey, string? hearAboutOther)
    {
        if (string.IsNullOrWhiteSpace(hearAboutKey)) return "—";
        if (!HearAbout.TryGetValue(hearAboutKey, out var pair)) return WebUtility.HtmlEncode(hearAboutKey);
        var label = lang == "en" ? pair.en : pair.fr;
        var trimmedOther = (hearAboutOther ?? "").Trim();
        if (trimmedOther.Length > 500) trimmedOther = trimmedOther[..500];
        if (hearAboutKey == "other" && trimmedOther.Length > 0)
        {
            return $"{WebUtility.HtmlEncode(label)} — {WebUtility.HtmlEncode(trimmedOther)}";
        }
        return WebUtility.HtmlEncode(label);
    }

    public static string FormatHearAboutPlain(string lang, string? hearAboutKey, string? hearAboutOther)
    {
        if (string.IsNullOrWhiteSpace(hearAboutKey)) return "—";
        if (!HearAbout.TryGetValue(hearAboutKey, out var pair)) return hearAboutKey;
        var label = lang == "en" ? pair.en : pair.fr;
        var trimmedOther = (hearAboutOther ?? "").Trim();
        if (trimmedOther.Length > 500) trimmedOther = trimmedOther[..500];
        if (hearAboutKey == "other" && trimmedOther.Length > 0)
        {
            return $"{label} — {System.Text.RegularExpressions.Regex.Replace(trimmedOther, @"\s+", " ")}";
        }
        return label;
    }

    public static string NormalizeLang(string? lang) =>
        string.Equals((lang ?? "").Trim(), "en", StringComparison.OrdinalIgnoreCase) ? "en" : "fr";

    // -----------------------------------------------------------------------
    // Password reset — user-facing email sent by AuthController.ForgotPassword.
    // Mirrors the shape of SendMemberCredentialsAsync (dark-green frame,
    // gradient header, orange CTA, single-paragraph body + expiration line).
    // -----------------------------------------------------------------------
    public record PasswordResetStrings(
        string Subject,
        string Heading,
        Func<string, int, string> Body1,
        string Body2,
        Func<string, string> ExpiryLine,
        string Cta
    );

    // Admin console is English-only; reset emails match that surface.
    public static PasswordResetStrings AdminPasswordReset() => new(
        Subject: "Reset your Pavillon 46 admin password",
        Heading: "Reset your admin password",
        Body1: (name, ttlMinutes) => $"Hi {name}, we received a request to reset the password for your Pavillon 46 admin account. Click the button below to choose a new password. This link will expire in {FormatTtl(ttlMinutes, "en")}.",
        Body2: "If you didn't request this, you can safely ignore this email — your password will not change.",
        ExpiryLine: when => $"This link expires at {when} (Swiss time).",
        Cta: "Choose a new password");

    public static PasswordResetStrings PasswordReset(string lang) => lang == "en"
        ? new PasswordResetStrings(
            Subject: "Reset your Pavillon 46 password",
            Heading: "Reset your password",
            Body1: (name, ttlMinutes) => $"Hi {name}, we received a request to reset the password for your Pavillon 46 account. Click the button below to choose a new password. This link will expire in {FormatTtl(ttlMinutes, "en")}.",
            Body2: "If you didn't request this, you can safely ignore this email — your password will not change.",
            ExpiryLine: when => $"This link expires at {when} (Swiss time).",
            Cta: "Choose a new password")
        : new PasswordResetStrings(
            Subject: "Réinitialisation de votre mot de passe — Pavillon 46",
            Heading: "Réinitialisation de votre mot de passe",
            Body1: (name, ttlMinutes) => $"Bonjour {name}, nous avons reçu une demande de réinitialisation de mot de passe pour votre compte Pavillon 46. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expirera dans {FormatTtl(ttlMinutes, "fr")}.",
            Body2: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail — votre mot de passe restera inchangé.",
            ExpiryLine: when => $"Ce lien expire à {when} (heure suisse).",
            Cta: "Choisir un nouveau mot de passe");

    private static string FormatTtl(int minutes, string lang)
    {
        var safe = Math.Max(1, minutes);
        if (safe % 60 == 0)
        {
            var hours = safe / 60;
            if (lang == "en") return hours == 1 ? "1 hour" : $"{hours} hours";
            return hours == 1 ? "1 heure" : $"{hours} heures";
        }
        if (lang == "en") return safe == 1 ? "1 minute" : $"{safe} minutes";
        return safe == 1 ? "1 minute" : $"{safe} minutes";
    }
}
