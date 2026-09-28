namespace Pavillon46.Api.Models;

/// <summary>
/// Facts about the venue that member-facing copy repeats in more than one
/// place. They live here so a change lands everywhere at once: the opening year
/// used to be typed out by hand in the announcement seed, in the newsletter AI
/// system prompt and in the frontend translations, and nothing kept the three
/// in step.
/// </summary>
/// <remarks>
/// The frontend holds its own copy as <c>OPENING_YEAR</c> in
/// <c>frontend/src/lib/translations.ts</c>. A TypeScript bundle cannot import a
/// C# constant, and serving this over the API would make the landing page's
/// headline copy wait on a network round trip, so the two are kept in sync by
/// hand — change both together.
/// </remarks>
public static class SiteFacts
{
    /// <summary>The calendar year the club opens, as it appears in copy.</summary>
    public const string OpeningYear = "2028";

    /// <summary>
    /// Sort anchor for the seeded opening announcement. The announcement list is
    /// ordered by this string, so it only has to place the entry correctly
    /// relative to the others. It is not a published opening date — the year
    /// above is the only claim the copy makes — and no UI renders it.
    /// </summary>
    public const string OpeningSortDate = OpeningYear + "-01-01";
}
