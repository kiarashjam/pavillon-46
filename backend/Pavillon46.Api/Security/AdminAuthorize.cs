using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Security;

/// <summary>
/// Decorate a controller/action with [AdminAuthorize] to require a valid bearer
/// token whose role is "admin" (issued by <c>ITokenService.CreateForAdmin</c>).
/// Member tokens — role "member" — are rejected, so this is strictly stronger
/// than [MemberAuthorize]. The resolved principal is attached to
/// HttpContext.Items and can be read via <see cref="AdminHttpContextExtensions.GetAdmin"/>.
/// </summary>
public class AdminAuthorizeAttribute : TypeFilterAttribute
{
    public AdminAuthorizeAttribute() : base(typeof(AdminAuthorizeFilter)) { }
}

public class AdminAuthorizeFilter : IAsyncAuthorizationFilter
{
    public const string ItemsKey = "AdminPrincipal";

    private readonly ITokenService _tokens;

    public AdminAuthorizeFilter(ITokenService tokens)
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
        if (principal is null || !principal.IsAdmin)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Unauthorized" });
            return Task.CompletedTask;
        }

        context.HttpContext.Items[ItemsKey] = principal;
        return Task.CompletedTask;
    }
}

public static class AdminHttpContextExtensions
{
    public static MemberPrincipal? GetAdmin(this HttpContext context) =>
        context.Items.TryGetValue(AdminAuthorizeFilter.ItemsKey, out var value)
            ? value as MemberPrincipal
            : null;
}
