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

    // -----------------------------------------------------------------------
    // Welcome — sent when the CadenceE CRM hands over a new member
    // (CadenceOnboardingService), unless the organisation sent its own design.
    // Same frame as the reset email: the member's first step is the same, choose
    // a password, so the button says so.
    // -----------------------------------------------------------------------
    public record WelcomeStrings(
        string Subject,
        string Heading,
        Func<string, string> Greeting,
        string Intro,
        Func<string, string> LoginLine,
        string StartLabel,
        string StartUndetermined,
        string Cta,
        Func<string, string> ExpiryLine,
        string Fallback
    );

    public static WelcomeStrings Welcome(string lang) => lang == "en"
        ? new WelcomeStrings(
            Subject: "Welcome to Pavillon 46 — your member area",
            Heading: "Welcome to Pavillon 46",
            Greeting: name => $"Hello {name},",
            Intro: "Your member area is ready. Choose your password to open it.",
            LoginLine: email => $"You sign in with: {email}",
            StartLabel: "Your membership starts",
            StartUndetermined: "to be confirmed",
            Cta: "Set my password",
            ExpiryLine: when => $"This link is valid until {when} (Swiss time). After that, use “Forgot password” on the sign-in page.",
            Fallback: "If the button does not work, paste this link into your browser:")
        : new WelcomeStrings(
            Subject: "Bienvenue au Pavillon 46 — votre espace membre",
            Heading: "Bienvenue au Pavillon 46",
            Greeting: name => $"Bonjour {name},",
            Intro: "Votre espace membre est prêt. Choisissez votre mot de passe pour y accéder.",
            LoginLine: email => $"Votre identifiant : {email}",
            StartLabel: "Début de votre adhésion",
            StartUndetermined: "à confirmer",
            Cta: "Choisir mon mot de passe",
            ExpiryLine: when => $"Ce lien est valable jusqu'au {when} (heure suisse). Passé ce délai, utilisez « Mot de passe oublié » sur la page de connexion.",
            Fallback: "Si le bouton ne fonctionne pas, collez ce lien dans votre navigateur :");

    /// <summary>"15 janvier 2027" / "15 January 2027", or the undetermined wording.</summary>
    public static string MembershipStart(string startDate, bool undetermined, string lang)
    {
        if (DateTime.TryParseExact(startDate, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var date))
        {
            var culture = new System.Globalization.CultureInfo(lang == "en" ? "en-GB" : "fr-CH");
            return date.ToString("d MMMM yyyy", culture);
        }
        return Welcome(lang).StartUndetermined;
    }

    // -----------------------------------------------------------------------
    // Meetings — MeetingEmailService. The person who booked gets their own
    // language; the team's notification is French, like the rest of its mail.
    // -----------------------------------------------------------------------
    public record MeetingConfirmationStrings(
        Func<string, string> Subject,
        string Eyebrow,
        Func<string, string> Heading,
        string Intro,
        string DateLabel,
        string TimeLabel,
        string DurationLabel,
        string PlaceLabel,
        string CodeLabel,
        Func<string, string, string> TimeValue,
        Func<int, string> Duration,
        string Address,
        string Contact,
        string Closing,
        string Team
    );

    public static MeetingConfirmationStrings MeetingConfirmation(string lang) => lang == "en"
        ? new MeetingConfirmationStrings(
            Subject: when => $"Your meeting at Pavillon 46 is confirmed — {when}",
            Eyebrow: "Meeting confirmed",
            Heading: name => string.IsNullOrWhiteSpace(name) ? "We look forward to meeting you" : $"We look forward to meeting you, {name}",
            Intro: "Your meeting with the Pavillon 46 team is booked. Here is everything you need.",
            DateLabel: "Date",
            TimeLabel: "Time",
            DurationLabel: "Duration",
            PlaceLabel: "Place",
            CodeLabel: "Reference",
            TimeValue: (start, end) => $"{start} – {end} (Swiss time)",
            Duration: minutes => $"{minutes} minutes",
            Address: "Pavillon 46 · La Croix-sur-Lutry · Vaud, Switzerland",
            Contact: "Something came up, or a question? Write to us at",
            Closing: "With warm regards,",
            Team: "The Pavillon 46 team")
        : new MeetingConfirmationStrings(
            Subject: when => $"Votre rendez-vous au Pavillon 46 est confirmé — {when}",
            Eyebrow: "Rendez-vous confirmé",
            Heading: name => string.IsNullOrWhiteSpace(name) ? "À très bientôt" : $"À très bientôt, {name}",
            Intro: "Votre rencontre avec l'équipe du Pavillon 46 est réservée. Voici l'essentiel.",
            DateLabel: "Date",
            TimeLabel: "Heure",
            DurationLabel: "Durée",
            PlaceLabel: "Lieu",
            CodeLabel: "Référence",
            TimeValue: (start, end) => $"{start} – {end} (heure suisse)",
            Duration: minutes => $"{minutes} minutes",
            Address: "Pavillon 46 · La Croix-sur-Lutry · Vaud, Suisse",
            Contact: "Un empêchement, une question ? Écrivez-nous à",
            Closing: "Avec nos meilleures salutations,",
            Team: "L'équipe du Pavillon 46");

    public record MeetingCancellationStrings(
        Func<string, string> Subject,
        string Heading,
        Func<string, string, string> Body,
        string Body2,
        string Cta,
        string Contact
    );

    public static MeetingCancellationStrings MeetingCancellation(string lang) => lang == "en"
        ? new MeetingCancellationStrings(
            Subject: when => $"Your meeting on {when} is cancelled — Pavillon 46",
            Heading: "Meeting cancelled",
            Body: (name, when) => $"Hello {name}, we are sorry to have to cancel your meeting on {when}. Please accept our apologies for the change.",
            Body2: "Choose another time whenever it suits you — we would be delighted to meet you.",
            Cta: "Choose another time",
            Contact: "Any question? Write to us at")
        : new MeetingCancellationStrings(
            Subject: when => $"Votre rendez-vous du {when} est annulé — Pavillon 46",
            Heading: "Rendez-vous annulé",
            Body: (name, when) => $"Bonjour {name}, nous sommes au regret de devoir annuler votre rendez-vous du {when}. Veuillez nous excuser pour ce changement.",
            Body2: "Choisissez un autre moment quand il vous convient : nous serons ravis de vous rencontrer.",
            Cta: "Choisir un autre moment",
            Contact: "Une question ? Écrivez-nous à");

    public record MeetingTeamStrings(
        Func<string, string, string> Subject,
        string Heading,
        string Intro,
        string NameLabel,
        string EmailLabel,
        string PhoneLabel,
        string DateLabel,
        string TimeLabel,
        string DurationLabel,
        string MessageLabel,
        string OriginLabel,
        string LanguageLabel,
        Func<string, string> FromInvitation,
        string Direct,
        string Cta
    );

    // Internal mail to the club's team: French only.
    public static MeetingTeamStrings MeetingTeam() => new(
        Subject: (name, when) => $"Nouveau rendez-vous : {name} — {when}",
        Heading: "Nouveau rendez-vous",
        Intro: "Un rendez-vous vient d'être réservé sur pavillon46.ch.",
        NameLabel: "Nom",
        EmailLabel: "E-mail",
        PhoneLabel: "Téléphone",
        DateLabel: "Date",
        TimeLabel: "Heure",
        DurationLabel: "Durée",
        MessageLabel: "Message",
        OriginLabel: "Origine",
        LanguageLabel: "Langue",
        FromInvitation: code => string.IsNullOrWhiteSpace(code)
            ? "Invitation CadenceE (lead lié dans le CRM)"
            : $"Invitation CadenceE — code {code} (lead lié dans le CRM)",
        Direct: "Réservation directe sur le site (transmise au CRM comme nouveau lead)",
        Cta: "Voir les rendez-vous");

    /// <summary>"vendredi 20 novembre 2026" / "Friday 20 November 2026".</summary>
    public static string MeetingDate(DateOnly date, string lang) =>
        date.ToString("dddd d MMMM yyyy", new System.Globalization.CultureInfo(lang == "en" ? "en-GB" : "fr-CH"));

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
