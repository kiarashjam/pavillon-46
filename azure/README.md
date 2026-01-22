# Azure deployment (cheapest resource + publish)

This folder contains Bicep to create a **new resource group** (North Italy) and the **cheapest** Azure web resource (**Static Web App** Free tier) in it, plus instructions to publish via GitHub Actions.

**Live site:** **https://kind-hill-0e0617903.1.azurestaticapps.net/**  
**Custom domain:** **https://pavillon46.ch**

**Resource:** `pavillon46-swa` in `rg-pavillon46` (West Europe).

**Deploy fails with "deployment_token was not provided"?** → Get the token (§2 below), add it as `AZURE_STATIC_WEB_APPS_API_TOKEN` at [GitHub Secrets](https://github.com/kiarashjam/pavillon-46/settings/secrets/actions), then re-run the workflow.

**GitHub → Actions → publish:** See **`GITHUB_AND_AZURE_SETUP.md`** in the project root for step‑by‑step: add GitHub remote, push, get deployment token for the *kind-hill* SWA, add `AZURE_STATIC_WEB_APPS_API_TOKEN`, then push to `main`/`master` to deploy.

**Regions:** The resource group uses **North Italy (italynorth)**. Static Web Apps only support `westeurope`, `eastus2`, `westus2`, `centralus`, `eastasia`, so the SWA is deployed in **West Europe** (closest to Italy).

## 1. Create the resource group and Static Web App

```bash
az login
az deployment sub create \
  --location italynorth \
  --template-file azure/main.bicep \
  --parameters azure/main.parameters.json
```

Or override parameters:

```bash
az deployment sub create \
  --location italynorth \
  --template-file azure/main.bicep \
  --parameters resourceGroupName=rg-myapp location=italynorth staticWebAppLocation=westeurope staticWebAppName=myapp-swa
```

After deployment, note the `defaultHostname` output (your site URL).

## 2. Get the deployment token for GitHub Actions

For the **live site** (kind-hill-0e0617903.1.azurestaticapps.net), use the token from *that* Static Web App. In Azure Portal → **Static Web Apps** → open the app with that URL → **Manage deployment token** → Copy.

If using the Bicep-deployed app (`pavillon46-swa`):

```bash
az staticwebapp secrets list \
  --name pavillon46-swa \
  --resource-group rg-pavillon46 \
  --query properties.apiKey -o tsv
```

## 3. Add the token as a GitHub secret

**If your Actions run fails with "deployment_token was not provided":** add this secret so the workflow can publish to Azure.

1. Open **https://github.com/kiarashjam/pavillon-46/settings/secrets/actions**
2. Click **New repository secret**
3. **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN` (exactly)
4. **Value:** paste the token from step 2 (Azure Portal or `az staticwebapp secrets list` output)
5. Click **Add secret**

Then push to `main`/`master` or run the workflow manually (**Actions** → **Publish to Azure Static Web App** → **Run workflow**) to deploy.

## 4. Publish via GitHub Actions

The workflow in `.github/workflows/azure-static-web-app.yml` builds the Next.js app and deploys it to the Static Web App. It runs on push to `main` or `master` (and on workflow_dispatch).

Ensure `AZURE_STATIC_WEB_APPS_API_TOKEN` is set for the target SWA (e.g. kind-hill), then push to `main`/`master` or run the workflow manually.

## Cost

- **Static Web App (Free)**: $0. No credit card required for free tier.
- Resource group: no cost by itself.
