using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IAnnouncementService
{
    Task<List<AnnouncementDto>> GetForLanguageAsync(string lang, CancellationToken ct = default);
}

/// <summary>
/// Curated, bilingual member announcements. Combines a small static editorial
/// seed (kept in-file so an empty newsletter store still shows something on
/// the dashboard) with every published/sent newsletter, projected onto the
/// same <see cref="AnnouncementDto"/> shape the frontend already renders.
/// Cover images are intentionally dropped by this projection — the dashboard
/// event list is short-form; the dedicated newsletters page renders imagery.
/// </summary>
public class AnnouncementService : IAnnouncementService
{
    private static readonly List<MemberAnnouncement> Seed = new()
    {
        new MemberAnnouncement
        {
            Id = "founding-members",
            Date = "2027-01-15",
            Tag = "Membership",
            TitleFr = "Cercle des membres fondateurs",
            TitleEn = "Founding Members Circle",
            BodyFr = "En tant que membre, vous faites partie du cercle fondateur du Pavillon 46. Votre code de parrainage vous permet d'inviter une personne de confiance à rejoindre l'aventure.",
            BodyEn = "As a member, you are part of the founding circle of Pavillon 46. Your referral code lets you invite one trusted person to join the journey.",
        },
        new MemberAnnouncement
        {
            Id = "preview-evening",
            Date = "2027-06-20",
            Tag = "Event",
            TitleFr = "Soirée d'avant-première privée",
            TitleEn = "Private Preview Evening",
            BodyFr = "Une soirée intimiste réservée aux membres se tiendra avant l'ouverture officielle. Les invitations seront envoyées à votre adresse e-mail enregistrée.",
            BodyEn = "An intimate members-only evening will take place ahead of the official opening. Invitations will be sent to your registered email address.",
        },
        new MemberAnnouncement
        {
            Id = "opening-2027",
            Date = "2027-12-01",
            Tag = "Opening",
            TitleFr = "Ouverture fin 2027",
            TitleEn = "Opening end of 2027",
            BodyFr = "Le Pavillon 46 ouvrira ses portes fin 2027 à La Croix-sur-Lutry. Les membres bénéficieront d'un accès prioritaire aux réservations.",
            BodyEn = "Pavillon 46 will open its doors at the end of 2027 in La Croix-sur-Lutry. Members will enjoy priority access to reservations.",
        },
    };

    private readonly INewsletterStore _newsletters;
    private readonly ILogger<AnnouncementService> _logger;

    public AnnouncementService(INewsletterStore newsletters, ILogger<AnnouncementService> logger)
    {
        _newsletters = newsletters;
        _logger = logger;
    }

    public async Task<List<AnnouncementDto>> GetForLanguageAsync(string lang, CancellationToken ct = default)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);

        // Newsletters that reached the member-visible states get merged onto
        // the dashboard event list. A store hiccup must never break the seed
        // announcements — we log and continue.
        var newsletters = new List<Newsletter>();
        try
        {
            var all = await _newsletters.ListAsync(ct);
            newsletters = all
                .Where(n =>
                    string.Equals(n.Status, "published", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(n.Status, "sent", StringComparison.OrdinalIgnoreCase))
                .Where(n => !string.IsNullOrWhiteSpace(n.PublishedAt))
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Newsletter store unavailable — announcement list falls back to seed only.");
        }

        var newsletterEntries = newsletters.Select(n => new MemberAnnouncement
        {
            Id = "newsletter-" + n.Id,
            // PublishedAt is ISO-8601 — take the first 10 chars for YYYY-MM-DD.
            Date = SafeDate(n.PublishedAt),
            Tag = string.IsNullOrWhiteSpace(n.Tag) ? "Newsletter" : n.Tag,
            TitleFr = n.TitleFr,
            TitleEn = n.TitleEn,
            BodyFr = n.BodyFr,
            BodyEn = n.BodyEn,
        });

        var combined = Seed.Concat(newsletterEntries);

        return combined
            .OrderByDescending(a => a.Date, StringComparer.Ordinal)
            .Select(a => new AnnouncementDto
            {
                Id = a.Id,
                Date = a.Date,
                Tag = a.Tag,
                Title = isEn ? a.TitleEn : a.TitleFr,
                Body = isEn ? a.BodyEn : a.BodyFr,
            })
            .ToList();
    }

    private static string SafeDate(string? isoTimestamp)
    {
        if (string.IsNullOrWhiteSpace(isoTimestamp)) return "";
        return isoTimestamp.Length >= 10 ? isoTimestamp[..10] : isoTimestamp;
    }
}
