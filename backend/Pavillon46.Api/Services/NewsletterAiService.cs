using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface INewsletterAiService
{
    /// <summary>Draft a full bilingual newsletter from a one-line brief.
    /// Returns a result object that carries either the parsed draft or a
    /// structured failure code (see <see cref="AiDraftResult"/>).</summary>
    Task<AiDraftResult> DraftAsync(string brief, string? tone, CancellationToken ct);
}

/// <summary>
/// Typed HttpClient wrapping the Anthropic Messages API. One shot, no retry —
/// the admin can click "Regenerate" if it fails. Follows the same
/// CancellationTokenSource-linked-timeout pattern as LeadsWebhookService.
/// Only depends on the JSON shape the model returns; the coverImageUrl is
/// resolved server-side (Unsplash HEAD → site fallback) in this service too so
/// the frontend gets a ready-to-render draft.
/// </summary>
public class NewsletterAiService : INewsletterAiService
{
    private readonly HttpClient _http;
    private readonly NewsletterOptions _opts;
    private readonly SiteOptions _site;
    private readonly ILogger<NewsletterAiService> _logger;

    // System prompt is a compile-time constant so re-reading a Newsletter row
    // long after send tells us exactly what tone it was drafted against. Match
    // the design's voice guidance verbatim — the model produces strict JSON.
    private const string SystemPrompt =
        "You are the editorial voice of Pavillon 46, a private, invitation-only wellness\n" +
        "retreat on the shore of Lake Geneva in La Croix-sur-Lutry, Switzerland. You\n" +
        "write short, evocative newsletters for members — never marketing, never salesy.\n" +
        "The tone is discreet, poetic, sensory: cool morning light on water, the ring of\n" +
        "a copper bell, the taste of a still-warm brioche. Sentences are unhurried;\n" +
        "adjectives are earned. You never use exclamation marks. You never say \"we're\n" +
        "thrilled\" or \"join us\" or \"don't miss\".\n\n" +
        "For every request, produce parallel French and English versions of the same\n" +
        "piece — same content, same rhythm, not a literal translation but the same\n" +
        "feeling. French is the primary voice; English is its quiet twin.\n\n" +
        "Return ONLY a JSON object, no prose before or after, no markdown fences. The\n" +
        "JSON has exactly these keys:\n\n" +
        "{\n" +
        "  \"titleFr\": \"3 to 8 words, French, no ending punctuation\",\n" +
        "  \"titleEn\": \"3 to 8 words, English, no ending punctuation\",\n" +
        "  \"bodyFr\": \"80 to 180 words, French, 2 to 4 paragraphs separated by \\\\n\\\\n\",\n" +
        "  \"bodyEn\": \"80 to 180 words, English, same paragraph structure as bodyFr\",\n" +
        "  \"tag\": \"one short lowercase English phrase, 1 to 3 words, e.g. 'winter', 'harvest supper', 'silence before dawn'\",\n" +
        "  \"coverImageKeyword\": \"3 to 5 English words describing a photograph that would sit under the title, comma-separated, e.g. 'lake geneva, misty morning, wooden dock'\"\n" +
        "}\n\n" +
        "Never explain your output. Never wrap the JSON in prose or code fences.";

    public NewsletterAiService(
        HttpClient http,
        IOptions<NewsletterOptions> opts,
        IOptions<SiteOptions> site,
        ILogger<NewsletterAiService> logger)
    {
        _http = http;
        _opts = opts.Value;
        _site = site.Value;
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

        var userMessage =
            $"Brief: {brief}\n\nTone hint (optional): {(string.IsNullOrWhiteSpace(tone) ? "" : tone)}\n\n" +
            "Write the newsletter now. Reply with the JSON only.";

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

        parsed.CoverImageUrl = await ResolveCoverImageAsync(parsed.CoverImageKeyword, cts.Token);
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
    private static string? ValidateFields(AiDraftResponse d)
    {
        if (string.IsNullOrWhiteSpace(d.TitleFr) || string.IsNullOrWhiteSpace(d.TitleEn)) return "empty_title";
        if (string.IsNullOrWhiteSpace(d.BodyFr) || string.IsNullOrWhiteSpace(d.BodyEn)) return "empty_body";
        if (string.IsNullOrWhiteSpace(d.Tag)) return "empty_tag";
        if (string.IsNullOrWhiteSpace(d.CoverImageKeyword)) return "empty_keyword";
        if (d.TitleFr.Trim().Length > 100 || d.TitleEn.Trim().Length > 100) return "title_too_long";

        var frWords = CountWords(d.BodyFr);
        var enWords = CountWords(d.BodyEn);
        if (frWords < 40 || enWords < 40) return "body_too_short";
        if (frWords > 300 || enWords > 300) return "body_too_long";

        return null;
    }

    private static int CountWords(string s) =>
        Regex.Matches(s ?? "", @"\S+").Count;

    // Build the Unsplash Source URL from the keyword and HEAD-check it. When
    // the check fails or times out (3s) we fall back to the bundled site
    // asset so the email never renders a broken image.
    private async Task<string> ResolveCoverImageAsync(string keyword, CancellationToken ct)
    {
        var fallback = _site.Page("images/newsletter-cover-default.jpg");
        if (string.IsNullOrWhiteSpace(keyword)) return fallback;

        var encoded = Uri.EscapeDataString(keyword.Trim());
        var url = $"https://source.unsplash.com/1200x600/?{encoded}";

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));
            using var req = new HttpRequestMessage(HttpMethod.Head, url);
            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            return resp.IsSuccessStatusCode ? url : fallback;
        }
        catch (Exception ex)
        {
            _logger.LogInformation(ex, "Unsplash HEAD failed for {Keyword}; using site fallback", keyword);
            return fallback;
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max]);
}
