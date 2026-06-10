using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface ILeadsWebhookService
{
    Task<WebhookResult> PostLeadAsync(LeadPayload lead, CancellationToken ct = default);
}
