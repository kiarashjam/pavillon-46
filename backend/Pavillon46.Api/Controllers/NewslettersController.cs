using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Anonymous endpoints for the newsletter module. The only route here is the
/// per-member unsubscribe link — deliberately not <c>[MemberAuthorize]</c> so
/// that clicking from an email client works without a session. Token
/// validation and the 200-always contract are documented on the action.
/// </summary>
[ApiController]
[Route("api/newsletters")]
public class NewslettersController : ControllerBase
{
    private readonly IMemberStore _members;
    private readonly IUnsubscribeTokenService _tokens;
    private readonly SiteOptions _site;
    private readonly ILogger<NewslettersController> _logger;

    public NewslettersController(
        IMemberStore members,
        IUnsubscribeTokenService tokens,
        IOptions<SiteOptions> site,
        ILogger<NewslettersController> logger)
    {
        _members = members;
        _tokens = tokens;
        _site = site.Value;
        _logger = logger;
    }

    /// <summary>
    /// Unsubscribe a member from newsletters. Always returns 200 with an HTML
    /// confirmation page — even on an invalid token — so a stale email link
    /// never surfaces a 4xx to a recipient. Idempotent: a second click on the
    /// same link re-renders the same confirmation. Token validation uses a
    /// constant-time comparison so timing signals cannot leak membership.
    /// </summary>
    [HttpGet("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromQuery] string? t, [FromQuery] string? lang, CancellationToken ct)
    {
        if (!_tokens.TryValidate(t, out var memberId))
        {
            _logger.LogInformation("Newsletter unsubscribe called with invalid or missing token");
            return HtmlPage(BuildBody(state: "invalid"));
        }

        var member = await _members.GetByIdAsync(memberId, ct);
        if (member is null)
        {
            // Token was well-formed but the member no longer exists (deleted).
            // Same neutral message — never leak identity.
            return HtmlPage(BuildBody(state: "invalid"));
        }

        if (!member.NewsletterOptOut)
        {
            member.NewsletterOptOut = true;
            member.UpdatedAt = DateTime.UtcNow.ToString("o");
            await _members.UpsertAsync(member, ct);
            _logger.LogInformation("Member {MemberId} unsubscribed from newsletters", member.Id);
        }

        _ = lang; // Reserved — the page is bilingual, so lang is not needed.
        return HtmlPage(BuildBody(state: "unsubscribed"));
    }

    private ContentResult HtmlPage(string body)
    {
        return new ContentResult
        {
            Content = body,
            ContentType = "text/html; charset=utf-8",
            StatusCode = (int)HttpStatusCode.OK,
        };
    }

    // Renders a bilingual (FR + EN stacked) confirmation shell that matches
    // the dark-green visual language of the other transactional emails.
    private string BuildBody(string state)
    {
        var logo = _site.Page("images/logo.png");
        var loginUrl = _site.Page("login");
        var year = DateTime.UtcNow.Year;

        string headingFr, headingEn, bodyFr, bodyEn;
        if (state == "unsubscribed")
        {
            headingFr = "Vous êtes désabonné";
            headingEn = "You are unsubscribed";
            bodyFr = "Vous ne recevrez plus nos infolettres. Vous pouvez vous réabonner à tout moment depuis votre espace membre.";
            bodyEn = "You will no longer receive our newsletters. You can resubscribe at any time from your member area.";
        }
        else
        {
            headingFr = "Lien invalide";
            headingEn = "Invalid link";
            bodyFr = "Ce lien de désabonnement n'est plus valide. Si vous souhaitez toujours vous désabonner, écrivez-nous depuis votre espace membre.";
            bodyEn = "This unsubscribe link is no longer valid. If you still wish to unsubscribe, please contact us from your member area.";
        }

        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\">");
        sb.Append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">");
        sb.Append("<title>").Append(WebUtility.HtmlEncode(headingFr)).Append(" — Pavillon 46</title></head>");
        sb.Append("<body style=\"font-family:Jost,'Helvetica Neue',Arial,sans-serif;color:#1d2b24;background:#0f261d;margin:0;padding:0;min-height:100vh;\">");
        sb.Append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:#0f261d;padding:56px 16px;\"><tr><td align=\"center\">");
        sb.Append("<table role=\"presentation\" width=\"520\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"max-width:520px;width:100%;background:#fcf8f7;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.35);\">");
        sb.Append("<tr><td style=\"background:linear-gradient(135deg,#265640 0%,#3a6f58 100%);padding:36px 28px 28px;text-align:center;\">");
        sb.Append("<img src=\"").Append(logo).Append("\" alt=\"Pavillon 46\" width=\"140\" style=\"display:inline-block;max-width:140px;width:100%;height:auto;filter:brightness(0) invert(1);\"/>");
        sb.Append("</td></tr>");
        sb.Append("<tr><td style=\"padding:36px 32px 8px;text-align:center;\">");
        sb.Append("<h1 style=\"margin:0 0 12px 0;font-weight:400;font-size:26px;color:#265640;\">").Append(WebUtility.HtmlEncode(headingFr)).Append("</h1>");
        sb.Append("<p style=\"margin:0 0 22px 0;font-size:15px;color:#3a4a42;line-height:1.7;\">").Append(WebUtility.HtmlEncode(bodyFr)).Append("</p>");
        sb.Append("<div style=\"height:1px;background:linear-gradient(to right,transparent,rgba(38,86,64,0.2),transparent);margin:0 auto 22px;max-width:280px;\"></div>");
        sb.Append("<h2 style=\"margin:0 0 10px 0;font-weight:400;font-size:20px;color:#265640;\">").Append(WebUtility.HtmlEncode(headingEn)).Append("</h2>");
        sb.Append("<p style=\"margin:0 0 24px 0;font-size:14px;color:#3a4a42;line-height:1.7;\">").Append(WebUtility.HtmlEncode(bodyEn)).Append("</p>");
        sb.Append("<a href=\"").Append(loginUrl).Append("\" style=\"display:inline-block;background:#265640;color:#fff;text-decoration:none;font-size:15px;padding:12px 30px;border-radius:8px;\">Espace membre</a>");
        sb.Append("</td></tr>");
        sb.Append("<tr><td style=\"padding:22px 28px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);font-size:11px;color:#8a9a92;text-align:center;line-height:1.7;\">");
        sb.Append("© ").Append(year).Append(" Pavillon 46 — La Croix-sur-Lutry, Suisse");
        sb.Append("</td></tr></table></td></tr></table></body></html>");
        return sb.ToString();
    }
}
