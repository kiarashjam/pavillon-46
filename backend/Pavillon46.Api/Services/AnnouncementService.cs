using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IAnnouncementService
{
    List<AnnouncementDto> GetForLanguage(string lang);
}

/// <summary>
/// Curated, bilingual member announcements. Static for now (no admin authoring
/// surface yet); swap for a store later without changing the controller/API.
/// </summary>
public class AnnouncementService : IAnnouncementService
{
    private static readonly List<MemberAnnouncement> Source = new()
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

    public List<AnnouncementDto> GetForLanguage(string lang)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        return Source
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
}
