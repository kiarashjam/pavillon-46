using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pavillon46.Api.Models;

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

    public MemberAuthorizeFilter(ITokenService tokens)
    {
        _tokens = tokens;
    }

    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
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
            return Task.CompletedTask;
        }

        context.HttpContext.Items[ItemsKey] = principal;
        return Task.CompletedTask;
    }
}

public static class HttpContextExtensions
{
    public static MemberPrincipal? GetMember(this HttpContext context) =>
        context.Items.TryGetValue(MemberAuthorizeFilter.ItemsKey, out var value)
            ? value as MemberPrincipal
            : null;
}
