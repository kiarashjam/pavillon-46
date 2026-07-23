using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Security;

/// <summary>
/// Decorate a controller/action with [MemberAuthorize] to require a valid member
/// bearer token. The resolved <see cref="MemberPrincipal"/> is attached to
/// HttpContext.Items and can be read via <see cref="HttpContextExtensions.GetMember"/>.
/// </summary>
public class MemberAuthorizeAttribute : TypeFilterAttribute
{
    public MemberAuthorizeAttribute() : base(typeof(MemberAuthorizeFilter)) { }
}

public class MemberAuthorizeFilter : IAsyncAuthorizationFilter
{
    public const string ItemsKey = "MemberPrincipal";

    private readonly ITokenService _tokens;
    private readonly IMemberStore _members;

    public MemberAuthorizeFilter(ITokenService tokens, IMemberStore members)
    {
        _tokens = tokens;
        _members = members;
    }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var header = context.HttpContext.Request.Headers.Authorization.ToString();
        string? token = null;
        if (!string.IsNullOrEmpty(header) && header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            token = header["Bearer ".Length..].Trim();
        }

        var principal = _tokens.Validate(token);
        if (principal is null)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Unauthorized" });
            return;
        }

        // Version check: a password reset (or any other password change) bumps
        // Member.PasswordVersion, invalidating every token issued before the
        // change. Admin tokens carry Pv = 0 and skip this check — they are a
        // separate identity handled by AdminAuthorize.
        if (!principal.IsAdmin)
        {
            var ct = context.HttpContext.RequestAborted;
            var member = await _members.GetByIdAsync(principal.MemberId, ct);
            if (member is null
                || !string.Equals(member.Status, "active", StringComparison.OrdinalIgnoreCase)
                || member.PasswordVersion != principal.PasswordVersion)
            {
                context.Result = new UnauthorizedObjectResult(new { message = "Unauthorized" });
                return;
            }
        }

        context.HttpContext.Items[ItemsKey] = principal;
    }
}

public static class HttpContextExtensions
{
    public static MemberPrincipal? GetMember(this HttpContext context) =>
        context.Items.TryGetValue(MemberAuthorizeFilter.ItemsKey, out var value)
            ? value as MemberPrincipal
            : null;
}
