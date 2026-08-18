using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

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
    private readonly IAdminStore _admins;

    public AdminAuthorizeFilter(ITokenService tokens, IAdminStore admins)
    {
        _tokens = tokens;
        _admins = admins;
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
        if (principal is null || !principal.IsAdmin)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Unauthorized" });
            return;
        }

        // Re-load the admin row: a password reset bumps PasswordVersion (and a
        // deleted / inactive account must stop working immediately, not at expiry).
        var admin = await _admins.GetByIdAsync(principal.MemberId, context.HttpContext.RequestAborted);
        if (admin is null
            || !string.Equals(admin.Status, "active", StringComparison.OrdinalIgnoreCase)
            || admin.PasswordVersion != principal.PasswordVersion)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Unauthorized" });
            return;
        }

        context.HttpContext.Items[ItemsKey] = principal;
    }
}

public static class AdminHttpContextExtensions
{
    public static MemberPrincipal? GetAdmin(this HttpContext context) =>
        context.Items.TryGetValue(AdminAuthorizeFilter.ItemsKey, out var value)
            ? value as MemberPrincipal
            : null;
}
