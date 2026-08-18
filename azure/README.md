# Azure deployment

Infrastructure for Pavillon 46: **Static Web App** (Vite frontend), **Linux App Service** (.NET 8 API),
and **Table Storage** (activity events).

**Live site:** https://kind-hill-0e0617903.1.azurestaticapps.net/  
**Custom domain:** https://pavillon46.ch

## Resources (Bicep)

| Resource | SKU | Purpose |
| --- | --- | --- |
| Static Web App | Free | React/Vite SPA, CDN, custom domain |
| App Service Plan | **B1** Linux (default) | .NET 8 API — 1.75 GB RAM, always-on |
| Web App | `pavillon46-api` | `/api/*` endpoints (waitlist, SMS, activity) |
| Storage Account | Standard LRS | `ActivityEvents` table for page views / clicks |

**B1** is the recommended minimum for production (always-on, stable Twilio/SendGrid calls). Use `appServiceSku=F1` in parameters only for dev/test (60 min/day compute limit).

## 1. Deploy infrastructure

```bash
az login
az deployment sub create \
  --location italynorth \
  --template-file azure/main.bicep \
  --parameters azure/main.parameters.json
```

Note the outputs: `webAppUrl`, `staticWebAppUrl`, `deploymentTokenHint`.

If the storage account name `pavillon46store` is taken globally, override it:

```bash
az deployment sub create \
  --location italynorth \
  --template-file azure/main.bicep \
  --parameters azure/main.parameters.json storageAccountName=p46activityYOURNAME
```

## 2. Configure App Service secrets

In **Azure Portal → App Service → pavillon46-api → Configuration → Application settings**, add:

- `SENDGRID_API_KEY`, `FROM_EMAIL` (must be a **verified SendGrid sender**), `ADMIN_EMAIL`
- Optional recovery: `ADMIN_SEED_PASSWORD` — applied on restart only to `kia@bonapp.group` while that account still must change password. Does not overwrite a password that was already changed.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- `LEADS_WEBHOOK_URL`, `LEADS_WEBHOOK_API_KEY` (optional)
- `ACTIVITY_REPORT_KEY`, `ACTIVITY_IP_SALT`, `ACTIVITY_DAILY_REPORT_TO`

`AZURE_STORAGE_CONNECTION_STRING` and CORS origins are set automatically by Bicep.

## 3. GitHub Actions secrets

Add at https://github.com/kiarashjam/pavillon-46/settings/secrets/actions:

| Secret | Value |
| --- | --- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA deployment token (Portal → Static Web App → Manage deployment token) |
| `API_BASE_URL` | Backend URL, e.g. `https://pavillon46-api.azurewebsites.net` |
| `AZURE_WEBAPP_NAME` | `pavillon46-api` |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | App Service → Get publish profile (full XML) |
| `ACTIVITY_REPORT_KEY` | Same value as `ACTIVITY_REPORT_KEY` in App Service settings |

## 4. Workflows

| Workflow | Trigger | Deploys |
| --- | --- | --- |
| `build.yml` | Push / PR | CI build only (frontend + backend) |
| `azure-static-web-app.yml` | Push to `main`/`master` | Vite SPA + `staticwebapp.config.json` API proxy |
| `azure-backend-app-service.yml` | Push to `main`/`master` | .NET 8 API to App Service |
| `activity-daily-report.yml` | Daily cron + manual | Calls `POST /api/activity/daily-report` |

The frontend workflow generates `staticwebapp.config.json` so:

- `/waitlist`, `/login`, etc. resolve via SPA fallback (no 404 on refresh)
- `/api/*` is proxied to the App Service URL from `API_BASE_URL`

## 5. Get the SWA deployment token

For the live **kind-hill** site:

**Azure Portal → Static Web Apps → (your app) → Manage deployment token → Copy**

Or for the Bicep-deployed app:

```bash
az staticwebapp secrets list \
  --name pavillon46-swa \
  --resource-group rg-pavillon46 \
  --query properties.apiKey -o tsv
```

## Cost (approximate)

- Static Web App Free: **$0**
- App Service B1 Linux: **~CHF 13/month**
- Storage Standard LRS: **< CHF 1/month** at this traffic level
