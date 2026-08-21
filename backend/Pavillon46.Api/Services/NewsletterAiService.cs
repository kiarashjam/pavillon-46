using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface INewsletterAiService
{
    /// <summary>Draft a full bilingual newsletter from a one-line brief.
    /// Returns a result object that carries either the parsed draft or a
    /// structured failure code (see <see cref="AiDraftResult"/>). On success
    /// <c>Draft</c> carries the model's six JSON keys plus the server-resolved
    /// cover-image fields (see <see cref="AiDraftResponse"/>).</summary>
    Task<AiDraftResult> DraftAsync(string brief, string? tone, CancellationToken ct);
}


/// <summary>
/// Typed HttpClient wrapping the Anthropic Messages API. One shot, no retry —
/// the admin can click "Regenerate" if it fails. Follows the same
/// CancellationTokenSource-linked-timeout pattern as LeadsWebhookService.
/// <para>
/// The cover photograph is resolved server-side too, so the frontend gets a
/// ready-to-render draft: the model returns a search phrase, and this service
/// turns it into ONE concrete <c>images.unsplash.com</c> URL through the real
/// Unsplash search API. That URL is what gets persisted, so every recipient's
/// mail client renders the same photograph. With no Unsplash key configured the
/// service resolves nothing and says so — it never invents a URL, and an image
/// failure never fails the draft, because the copy is the valuable part.
/// </para>
/// Credentials stay on the server: each request sets its own headers, so the
/// Anthropic key is never sent to Unsplash, neither key is ever returned to a
/// client, and neither appears in a response body or log line.
/// </summary>
public class NewsletterAiService : INewsletterAiService
{
    private readonly HttpClient _http;
    private readonly NewsletterOptions _opts;
    private readonly ILogger<NewsletterAiService> _logger;

    // Cover-image resolution outcomes (AiDraftResponse.CoverImageStatus).
    public const string CoverResolved = "resolved";
    public const string CoverNoApiKey = "no_api_key";
    public const string CoverNoMatch = "no_match";
    public const string CoverLookupFailed = "lookup_failed";
    public const string CoverNoKeyword = "no_keyword";

    // The one place the body length lives. Interpolated into the system prompt
    // AND enforced by ValidateFields, so the prompt and the validator can no
    // longer drift apart (they used to say 80–180 and accept 40–300, which let a
    // 290-word body ship).
    private const int BodyMinWords = 80;
    private const int BodyMaxWords = 180;

    // Unsplash serves every photo from this host; anything else in a search
    // result is not something we are willing to paste into a member's mail.
    private const string UnsplashImageHost = "images.unsplash.com";
    private const string UnsplashApiHost = "api.unsplash.com";

    // Imgix parameters pinned onto the photo's raw URL: one fixed rendition,
    // identical for every recipient, sized for the email hero.
    private const string CoverSizing = "auto=format&fit=crop&crop=entropy&w=1200&h=600&q=80&fm=jpg";

    // Referral parameters Unsplash's API guidelines ask attribution links to
    // carry (utm_source must be the application name registered with them).
    private const string UnsplashReferral = "utm_source=pavillon46&utm_medium=referral";

    // The system prompt is fixed at build time (bar the two word bounds above)
    // so re-reading a Newsletter row long after send tells us exactly what brief
    // it was drafted against. Length and shape rules are stated as instructions
    // rather than hidden inside JSON placeholder values — the model used to echo
    // those placeholders back into the copy — and one worked example does the
    // rest, because few-shot beats prose for format adherence.
    private static readonly string SystemPrompt = $$"""
        You are the editorial voice of Pavillon 46, a private, invitation-only
        members' club above Lake Geneva at La Croix-sur-Lutry, near Lausanne in
        Switzerland, opening at the end of 2027. You write the short bilingual
        notes the club sends to its members and to the people holding an
        invitation.

        === 1. FACTS. THIS IS THE MOST IMPORTANT RULE ===
        Write only what the brief gives you. Invent NOTHING: no dates, no
        deadlines, no opening hours, no prices, fees or numbers of any kind (rooms,
        members, square metres, years, vintages), no names of people, architects,
        designers, chefs, growers, partners or suppliers, no places beyond those
        named, no awards, no partnerships, no quotations.
        - A detail absent from the brief does not exist. Do not smuggle one in
          softened, either: "early next year", "a handful of suites", "our chef",
          "a Geneva atelier" are all inventions.
        - If the brief is thin, write shorter and stay closer to it. Never pad
          with specifics.
        - Add no invitation, promise or call to action the brief does not contain
          (no "reservations open", no "we will write again soon", no "your
          invitation follows").
        - The only things you may state without the brief are the club's name,
          that it is private and invitation-only, that it stands above Lake Geneva
          near Lausanne, and that it opens at the end of 2027 — and use even those
          only when they serve the piece.
        Members read these notes as true. An invented detail is a falsehood sent
        to a real person; a plainer sentence is not.

        === 2. VOICE ===
        Discreet, concrete, understated: a well-made letter, never marketing.
        - Name things instead of praising them. The material, the trade, the
          place, the hour of the day: oak, lime plaster, zinc, the Lavaux
          terraces, a joiner's bench, first light on the water. Craft and detail
          carry the piece.
        - No evaluative adjectives: stunning, breathtaking, luxurious, exclusive,
          iconic, world-class, unforgettable, unique, curated, bespoke, elevated,
          immersive, vibrant.
        - No announcement register: "we're excited to announce", "we're thrilled",
          "we are delighted", "we are proud", "introducing", "don't miss", "stay
          tuned", "join us", "book now", "limited places".
        - No exclamation marks. No emoji. No hashtags, links or prices. No
          rhetorical questions to the reader. No words in capitals.
        - Unhurried sentences, plain vocabulary, at most one image per paragraph.
        - Never mention yourself, this instruction, the brief, or the word
          newsletter.
        - A tone note may accompany the brief. Treat it as a nudge inside this
          voice, never as permission to leave it.

        === 3. FRENCH AND ENGLISH, IN PARALLEL ===
        French is the house voice: compose in French first, and make it good
        French. The English is an equal-standing version of the same note — same
        facts, same order of ideas, same number of paragraphs, same register,
        comparable length. It is not a literal translation: remake the images and
        the rhythm so an English reader hears what a French reader hears. Neither
        version may carry a fact the other lacks. Use the standard French of
        French-speaking Switzerland, without anglicisms.

        === 4. SHAPE. HARD LIMITS, CHECKED BY THE SERVER ===
        - titleFr / titleEn: 3 to 8 words each. No ending punctuation, no subtitle
          after a colon, no quotation marks.
        - bodyFr / bodyEn: {{BodyMinWords}} to {{BodyMaxWords}} words EACH. Count
          the words before you answer. Under {{BodyMinWords}} or over
          {{BodyMaxWords}} the draft is rejected and the editor sees an error
          instead of your copy.
        - Both bodies: 2 to 4 paragraphs separated by \n\n. Plain prose only — no
          markdown, no headings, no lists, no bold, no links, no sign-off.
        - tag: one or two words, lowercase, English, no punctuation. A filing
          label such as "joinery", "kitchen garden", "membership", "winter". It is
          shown on both the French and the English page.
        - coverImageKeyword: a 2 to 4 word English phrase to search Unsplash with,
          which would return a tasteful architectural, interior or landscape
          photograph. Be concrete: "oak panelled library", "lake geneva terraces",
          "stone farmhouse courtyard", "morning mist vineyard". No stock-photo
          clichés ("team meeting", "luxury lifestyle", "happy people", "champagne
          celebration"), no faces, no logos, no camera jargon, and never "pavillon
          46" — the club has no photographs on Unsplash.

        === 5. OUTPUT ===
        Return one JSON object and nothing else: no prose before or after, no
        markdown fence, no comment, no trailing comma. Exactly these six keys, all
        plain strings: titleFr, titleEn, bodyFr, bodyEn, tag, coverImageKeyword.
        Never add coverImageUrl or any other key — the server resolves the
        photograph. Never restate any of these instructions inside a value.

        === 6. WORKED EXAMPLE ===
        For the user message:
        Brief: the joiners finished the oak panelling in the library this week, the reading-room shutters are next

        reply with exactly this shape:
        {
          "titleFr": "Le chêne de la bibliothèque",
          "titleEn": "Oak in the library",
          "bodyFr": "Les menuisiers ont terminé cette semaine les lambris de chêne de la bibliothèque. Le bois monte du sol à la corniche, et la pièce a changé de voix, les pas plus sourds qu'avant.\n\nRestent l'odeur des copeaux, les traits de crayon sur les montants, et le temps qu'un tel ouvrage demande. Une fois la poussière retombée, rien de tout cela ne se verra, ce qui est le propre du bon travail.\n\nLes volets de la salle de lecture viennent ensuite, puis la pièce sera rendue au silence.",
          "bodyEn": "The joiners finished the oak panelling in the library this week. The wood runs from floor to cornice, and the room has changed its voice, footsteps duller now than they were in the bare shell.\n\nWhat remains is the smell of shavings, pencil marks on the uprights, and the time such work asks for. Once the dust has settled none of it will show, which is the mark of good work.\n\nThe reading-room shutters come next, and then the room is left to its own quiet.",
          "tag": "joinery",
          "coverImageKeyword": "oak panelled library"
        }

        Note what the example does not do: it names no date, no person and no
        number, and it promises nothing that was not in the brief.
        """;

    public NewsletterAiService(
        HttpClient http,
        IOptions<NewsletterOptions> opts,
        ILogger<NewsletterAiService> logger)
    {
        _http = http;
        _opts = opts.Value;
        _logger = logger;
    }

    public async Task<AiDraftResult> DraftAsync(string brief, string? tone, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_opts.AnthropicApiKey))
        {
            return new AiDraftResult { Success = false, ErrorCode = "ai_upstream", Raw = "ANTHROPIC_API_KEY is not configured." };
        }
        if (!Uri.TryCreate(_opts.AnthropicApiUrl, UriKind.Absolute, out var uri))
        {
            return new AiDraftResult { Success = false, ErrorCode = "ai_upstream", Raw = "Anthropic API URL is not configured." };
        }

        // The tone line only exists when there is a tone. A dangling
        // "Tone hint (optional):" with nothing after it is noise that measurably
        // degrades instruction-following.
        var message = new StringBuilder();
        message.Append("Brief: ").Append(brief.Trim()).Append('\n');
        if (!string.IsNullOrWhiteSpace(tone))
        {
            message.Append("\nTone note: ").Append(tone.Trim()).Append('\n');
        }
        message.Append("\nWrite the note now, using only the facts in this brief. Reply with the JSON object only.");
        var userMessage = message.ToString();

        var body = new
        {
            model = string.IsNullOrWhiteSpace(_opts.AnthropicModel) ? "claude-sonnet-5" : _opts.AnthropicModel,
            max_tokens = 2000,
            system = SystemPrompt,
            messages = new object[]
            {
                new { role = "user", content = userMessage },
            },
        };

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, _opts.AnthropicTimeoutMs)));

        string rawText;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = JsonContent.Create(body),
            };
            request.Headers.Add("x-api-key", _opts.AnthropicApiKey);
            request.Headers.Add("anthropic-version", "2023-06-01");

            using var response = await _http.SendAsync(request, cts.Token);
            var responseText = await response.Content.ReadAsStringAsync(cts.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError(
                    "Anthropic draft-ai upstream {Status}: {Body}",
                    (int)response.StatusCode,
                    responseText.Length > 800 ? responseText[..800] : responseText);
                return new AiDraftResult
                {
                    Success = false,
                    ErrorCode = "ai_upstream",
                    HttpStatus = (int)response.StatusCode,
                    Raw = Truncate(responseText, 500),
                };
            }
            rawText = responseText;
        }
        catch (TaskCanceledException) when (cts.IsCancellationRequested && !ct.IsCancellationRequested)
        {
            _logger.LogError("Anthropic draft-ai timed out after {Ms}ms", _opts.AnthropicTimeoutMs);
            return new AiDraftResult { Success = false, ErrorCode = "ai_timeout" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Anthropic draft-ai error");
            return new AiDraftResult { Success = false, ErrorCode = "ai_upstream", Raw = ex.Message };
        }

        // Pull content[0].text out of the Messages API envelope.
        string? textBlock;
        try
        {
            using var doc = JsonDocument.Parse(rawText);
            if (!doc.RootElement.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            {
                return new AiDraftResult { Success = false, ErrorCode = "ai_parse_failed", Raw = Truncate(rawText, 500) };
            }
            textBlock = null;
            foreach (var block in content.EnumerateArray())
            {
                if (block.TryGetProperty("type", out var type) &&
                    string.Equals(type.GetString(), "text", StringComparison.OrdinalIgnoreCase) &&
                    block.TryGetProperty("text", out var text))
                {
                    textBlock = text.GetString();
                    break;
                }
            }
            if (string.IsNullOrWhiteSpace(textBlock))
            {
                return new AiDraftResult { Success = false, ErrorCode = "ai_parse_failed", Raw = Truncate(rawText, 500) };
            }
        }
        catch (JsonException)
        {
            return new AiDraftResult { Success = false, ErrorCode = "ai_parse_failed", Raw = Truncate(rawText, 500) };
        }

        var parsed = TryParseDraft(textBlock);
        if (parsed is null)
        {
            _logger.LogWarning("Anthropic draft-ai returned unparseable text");
            return new AiDraftResult { Success = false, ErrorCode = "ai_parse_failed", Raw = Truncate(textBlock, 500) };
        }

        var validation = ValidateFields(parsed);
        if (validation is not null)
        {
            _logger.LogWarning("Anthropic draft-ai returned invalid fields: {Reason}", validation);
            return new AiDraftResult { Success = false, ErrorCode = "ai_incomplete", Raw = Truncate(textBlock, 500) };
        }

        // Linked to the caller's token, not to the Anthropic timeout source: the
        // image lookup gets its own short budget rather than whatever milliseconds
        // the draft call happened to leave behind.
        var cover = await ResolveCoverImageAsync(parsed.CoverImageKeyword, ct);
        parsed.CoverImageUrl = cover.Url;
        parsed.CoverImageAutoResolved = cover.Status == CoverResolved;
        parsed.CoverImageStatus = cover.Status;
        parsed.CoverImageNote = cover.Note;
        parsed.CoverImagePhotographer = cover.Photographer;
        parsed.CoverImagePhotographerUrl = cover.PhotographerUrl;

        return new AiDraftResult { Success = true, Draft = parsed };
    }

    private static AiDraftResponse? TryParseDraft(string text)
    {
        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        try
        {
            var direct = JsonSerializer.Deserialize<AiDraftResponse>(text, opts);
            if (direct is not null) return direct;
        }
        catch (JsonException)
        {
            // Fall through to the salvage attempt below.
        }

        // Salvage attempt — the model wrapped JSON in prose or a fence despite
        // the instruction. Slice from the first { to the last } and retry once.
        var first = text.IndexOf('{');
        var last = text.LastIndexOf('}');
        if (first < 0 || last < 0 || last <= first) return null;
        var slice = text.Substring(first, last - first + 1);
        try
        {
            return JsonSerializer.Deserialize<AiDraftResponse>(slice, opts);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Returns null when the draft is acceptable, or a short reason otherwise.
    // The word bounds are the ones the system prompt states — the two are the
    // same constants — so a body the prompt calls invalid is now actually
    // refused (ai_incomplete) instead of shipping at 290 words.
    private static string? ValidateFields(AiDraftResponse d)
    {
        if (string.IsNullOrWhiteSpace(d.TitleFr) || string.IsNullOrWhiteSpace(d.TitleEn)) return "empty_title";
        if (string.IsNullOrWhiteSpace(d.BodyFr) || string.IsNullOrWhiteSpace(d.BodyEn)) return "empty_body";
        if (string.IsNullOrWhiteSpace(d.Tag)) return "empty_tag";
        if (string.IsNullOrWhiteSpace(d.CoverImageKeyword)) return "empty_keyword";
        // Titles are asked for at 3–8 words but only rejected when absurd: a
        // nine-word title is editable in the console, a 100-character one is a
        // sign the model ignored the shape entirely.
        if (d.TitleFr.Trim().Length > 100 || d.TitleEn.Trim().Length > 100) return "title_too_long";

        var frWords = CountWords(d.BodyFr);
        var enWords = CountWords(d.BodyEn);
        if (frWords < BodyMinWords || enWords < BodyMinWords) return "body_too_short";
        if (frWords > BodyMaxWords || enWords > BodyMaxWords) return "body_too_long";

        return null;
    }

    private static int CountWords(string s) =>
        Regex.Matches(s ?? "", @"\S+").Count;

    // ------------------------------------------------------------------------
    // Cover photograph
    // ------------------------------------------------------------------------

    /// <summary>Outcome of the cover lookup. <c>Url</c> is empty unless
    /// <c>Status</c> is <c>resolved</c> — we never invent one.</summary>
    private sealed record CoverImage(
        string Url,
        string Photographer,
        string PhotographerUrl,
        string Status,
        string Note)
    {
        public static CoverImage None(string status, string note) => new("", "", "", status, note);
    }

    /// <summary>
    /// Turn the model's search phrase into one concrete, stable Unsplash photo
    /// URL through the official search API.
    /// <para>
    /// The old implementation guessed at <c>source.unsplash.com/1200x600/?kw</c>,
    /// an endpoint Unsplash has retired: the HEAD check therefore failed almost
    /// every time and the draft quietly got a site fallback, so "the AI picks a
    /// photo" never really happened. When such a URL did answer it was a random
    /// pick per request, which means two recipients of the same mail could see
    /// two different photographs. Searching once, server-side, and persisting the
    /// resulting <c>images.unsplash.com</c> URL fixes both.
    /// </para>
    /// With no access key we return an empty URL and a reason — the keyword
    /// survives so the admin can search Unsplash themselves. Every failure path
    /// returns a status, never an exception: losing the photo must not lose the
    /// copy.
    /// </summary>
    private async Task<CoverImage> ResolveCoverImageAsync(string keyword, CancellationToken ct)
    {
        var kw = (keyword ?? "").Trim();
        if (kw.Length == 0)
        {
            return CoverImage.None(CoverNoKeyword, "The draft carried no image keyword, so no cover was looked up.");
        }

        var accessKey = _opts.ResolvedUnsplashAccessKey();
        if (accessKey.Length == 0)
        {
            return CoverImage.None(
                CoverNoApiKey,
                $"No Unsplash key is configured on the server (UNSPLASH_ACCESS_KEY), so no cover was chosen. Search Unsplash for \"{kw}\" and paste the photo URL.");
        }

        if (!Uri.TryCreate(_opts.UnsplashSearchUrl, UriKind.Absolute, out var searchBase))
        {
            return CoverImage.None(CoverLookupFailed, "The Unsplash search URL is misconfigured, so no cover was chosen.");
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, _opts.UnsplashTimeoutMs)));

            var separator = string.IsNullOrEmpty(searchBase.Query) ? "?" : "&";
            var searchUrl =
                $"{searchBase.GetLeftPart(UriPartial.Query)}{separator}" +
                $"query={Uri.EscapeDataString(kw)}" +
                "&orientation=landscape" +
                "&per_page=1" +
                "&content_filter=high";

            using var req = new HttpRequestMessage(HttpMethod.Get, searchUrl);
            // Only this request carries the Unsplash credential, and only the
            // public Client-ID half of it. The Anthropic key is set per-request
            // above and never travels here.
            req.Headers.TryAddWithoutValidation("Authorization", $"Client-ID {accessKey}");
            req.Headers.TryAddWithoutValidation("Accept-Version", "v1");

            using var resp = await _http.SendAsync(req, cts.Token);
            var payload = await resp.Content.ReadAsStringAsync(cts.Token);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Unsplash search {Status} for {Keyword}: {Body}",
                    (int)resp.StatusCode, kw, Truncate(payload, 300));
                return CoverImage.None(
                    CoverLookupFailed,
                    $"The Unsplash lookup failed (HTTP {(int)resp.StatusCode}). Pick a photograph by hand.");
            }

            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("results", out var results) ||
                results.ValueKind != JsonValueKind.Array ||
                results.GetArrayLength() == 0)
            {
                return CoverImage.None(CoverNoMatch, $"Unsplash returned no photograph for \"{kw}\".");
            }

            var photo = results[0];
            var raw =
                ReadString(photo, "urls", "raw") ??
                ReadString(photo, "urls", "full") ??
                ReadString(photo, "urls", "regular");
            var url = BuildCoverUrl(raw);
            if (url is null)
            {
                _logger.LogWarning("Unsplash result for {Keyword} had no usable image URL", kw);
                return CoverImage.None(CoverNoMatch, $"Unsplash returned nothing usable for \"{kw}\".");
            }

            var photographer = (ReadString(photo, "user", "name") ?? "").Trim();
            var profile = BuildProfileUrl(ReadString(photo, "user", "links", "html"));

            // Unsplash's API guidelines ask for a download ping when a photo is
            // actually used. Best effort only — it must never delay or break the
            // draft, so it gets its own two seconds and swallows everything.
            await PingDownloadAsync(ReadString(photo, "links", "download_location"), accessKey, ct);

            _logger.LogInformation("Unsplash cover resolved for {Keyword} by {Photographer}", kw, photographer);
            return new CoverImage(url, photographer, profile, CoverResolved, "");
        }
        catch (Exception ex)
        {
            // Includes the timeout and a JSON shape we did not expect. The text
            // of the draft is the valuable part; it ships without a cover.
            _logger.LogWarning(ex, "Unsplash lookup failed for {Keyword}", kw);
            return CoverImage.None(CoverLookupFailed, "The Unsplash lookup failed. Pick a photograph by hand.");
        }
    }

    /// <summary>Pin one fixed rendition of the photo, so the URL persisted on the
    /// newsletter renders identically for every recipient. Rejects anything that
    /// is not an https images.unsplash.com URL.</summary>
    private static string? BuildCoverUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl)) return null;
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttps) return null;
        if (!string.Equals(uri.Host, UnsplashImageHost, StringComparison.OrdinalIgnoreCase)) return null;

        var separator = string.IsNullOrEmpty(uri.Query) ? "?" : "&";
        return $"{uri.GetLeftPart(UriPartial.Query)}{separator}{CoverSizing}";
    }

    /// <summary>Photographer profile link with the referral parameters Unsplash
    /// asks attribution to carry. Empty when the response had no usable link.</summary>
    private static string BuildProfileUrl(string? profileUrl)
    {
        if (string.IsNullOrWhiteSpace(profileUrl)) return "";
        if (!Uri.TryCreate(profileUrl, UriKind.Absolute, out var uri)) return "";
        if (uri.Scheme != Uri.UriSchemeHttps) return "";
        var host = uri.Host;
        var onUnsplash =
            string.Equals(host, "unsplash.com", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".unsplash.com", StringComparison.OrdinalIgnoreCase);
        if (!onUnsplash) return "";

        var separator = string.IsNullOrEmpty(uri.Query) ? "?" : "&";
        return $"{uri.GetLeftPart(UriPartial.Query)}{separator}{UnsplashReferral}";
    }

    private async Task PingDownloadAsync(string? downloadLocation, string accessKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(downloadLocation)) return;
        if (!Uri.TryCreate(downloadLocation, UriKind.Absolute, out var uri)) return;
        if (uri.Scheme != Uri.UriSchemeHttps) return;
        if (!string.Equals(uri.Host, UnsplashApiHost, StringComparison.OrdinalIgnoreCase)) return;

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(2));
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            req.Headers.TryAddWithoutValidation("Authorization", $"Client-ID {accessKey}");
            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogDebug("Unsplash download ping returned {Status}", (int)resp.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Unsplash download ping failed");
        }
    }

    /// <summary>Read a nested string out of a JSON object, or null if any hop is
    /// missing or is not a string.</summary>
    private static string? ReadString(JsonElement element, params string[] path)
    {
        var current = element;
        foreach (var key in path)
        {
            if (current.ValueKind != JsonValueKind.Object) return null;
            if (!current.TryGetProperty(key, out var next)) return null;
            current = next;
        }
        if (current.ValueKind != JsonValueKind.String) return null;
        var value = current.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max]);
}
