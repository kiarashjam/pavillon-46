# Azure deployment (cheapest resource + publish)

This folder contains Bicep to create a **new resource group** and the **cheapest** Azure web resource (**Static Web App**, Free tier) in it, plus instructions to publish via GitHub Actions.

## 1. Create the resource group and Static Web App

```bash
az login
az deployment sub create \
  --location eastus \
  --template-file azure/main.bicep \
  --parameters azure/main.parameters.json
```

Or override parameters:

```bash
az deployment sub create \
  --location eastus \
  --template-file azure/main.bicep \
  --parameters resourceGroupName=rg-myapp location=eastus staticWebAppName=myapp-swa
```

After deployment, note the `defaultHostname` output (your site URL).

## 2. Get the deployment token for GitHub Actions

```bash
az staticwebapp secrets list \
  --name pavillon46-swa \
  --resource-group rg-pavillon46 \
  --query properties.apiKey -o tsv
```

## 3. Add the token as a GitHub secret

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Value: paste the token from step 2

## 4. Publish via GitHub Actions

The workflow in `.github/workflows/azure-static-web-app.yml` builds the Next.js app and deploys it to the Static Web App in your resource group. It runs on push to `main` (and on workflow_dispatch).

Ensure `AZURE_STATIC_WEB_APPS_API_TOKEN` is set, then push to `main` or run the workflow manually.

## Cost

- **Static Web App (Free)**: $0. No credit card required for free tier.
- Resource group: no cost by itself.
