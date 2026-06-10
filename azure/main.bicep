// Deploy at subscription scope: resource group + Static Web App (frontend) +
// Linux App Service (.NET API) + Table Storage (activity events).
//
// Usage:
//   az deployment sub create --location italynorth \
//     --template-file azure/main.bicep \
//     --parameters azure/main.parameters.json

targetScope = 'subscription'

@description('Name of the new resource group')
param resourceGroupName string = 'rg-pavillon46'

@description('Azure region for the resource group (e.g. italynorth)')
param location string = deployment().location

@description('Azure region for web workloads. Use westeurope for SWA + App Service.')
param computeLocation string = 'westeurope'

@description('Azure region for the Static Web App. Must be a supported SWA region.')
param staticWebAppLocation string = 'westeurope'

@description('Name of the Static Web App (frontend)')
param staticWebAppName string = 'pavillon46-swa'

@description('Name of the Linux App Service plan')
param appServicePlanName string = 'pavillon46-plan'

@description('Name of the Linux Web App (.NET API)')
param webAppName string = 'pavillon46-api'

@description('App Service SKU. B1 = 1.75 GB RAM, always-on (~CHF 13/mo). F1 = free tier with limits.')
@allowed(['F1', 'B1', 'S1'])
param appServiceSku string = 'B1'

@description('Globally unique storage account name for activity Table Storage')
param storageAccountName string = 'pavillon46store'

@description('Public site URL used in emails and CORS')
param frontendOrigin string = 'https://pavillon46.ch'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module swaModule 'static-web-app.bicep' = {
  scope: rg
  name: 'deploy-swa'
  params: {
    staticWebAppName: staticWebAppName
    location: staticWebAppLocation
  }
}

module storageModule 'storage.bicep' = {
  scope: rg
  name: 'deploy-storage'
  params: {
    storageAccountName: storageAccountName
    location: computeLocation
  }
}

module apiModule 'app-service.bicep' = {
  scope: rg
  name: 'deploy-api'
  params: {
    appServicePlanName: appServicePlanName
    webAppName: webAppName
    location: computeLocation
    skuName: appServiceSku
    frontendOrigin: frontendOrigin
    staticWebAppHostname: swaModule.outputs.defaultHostname
    storageConnectionString: storageModule.outputs.connectionString
    activityTableName: storageModule.outputs.activityTableName
  }
}

output resourceGroupName string = rg.name
output staticWebAppName string = swaModule.outputs.staticWebAppName
output staticWebAppHostname string = swaModule.outputs.defaultHostname
output staticWebAppUrl string = 'https://${swaModule.outputs.defaultHostname}'
output webAppName string = apiModule.outputs.webAppName
output webAppUrl string = apiModule.outputs.webAppUrl
output storageAccountName string = storageModule.outputs.storageAccountName
output deploymentTokenHint string = 'Run: az staticwebapp secrets list -n ${staticWebAppName} -g ${resourceGroupName} --query properties.apiKey -o tsv'
output githubSecretsHint string = 'Set GitHub secrets: AZURE_STATIC_WEB_APPS_API_TOKEN (SWA token), API_BASE_URL=${apiModule.outputs.webAppUrl}, AZURE_WEBAPP_NAME=${webAppName}, AZURE_WEBAPP_PUBLISH_PROFILE (download from Portal), ACTIVITY_REPORT_KEY'
