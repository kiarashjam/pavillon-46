namespace Pavillon46.Api.Services;

public enum VerifyResultKind
{
    Approved,
    InvalidCode,
    Expired,
    MaxAttempts,
    RateLimit,
    ServerError
}

public record SendVerificationResult(bool Ok, string Status, string? ErrorDetail = null);
public record VerifyCodeResult(VerifyResultKind Kind, string? ErrorDetail = null);

public interface IVerificationService
{
    Task<SendVerificationResult> SendCodeAsync(string countryCode, string phoneNumber, CancellationToken ct = default);
    Task<VerifyCodeResult> CheckCodeAsync(string countryCode, string phoneNumber, string code, CancellationToken ct = default);
}
