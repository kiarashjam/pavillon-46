targetScope = 'resourceGroup'

@description('Name of the App Service plan')
param appServicePlanName string

@description('Name of the Linux Web App hosting the .NET API')
param webAppName string

@description('Azure region for compute (e.g. westeurope)')
param location string

@description('App Service plan SKU name. B1 recommended for production; F1 is free but limited.')
@allowed(['F1', 'B1', 'S1'])
param skuName string = 'B1'

@description('Frontend origin allowed by API CORS (custom domain)')
param frontendOrigin string = 'https://pavillon46.ch'

@description('Static Web App default hostname for API CORS (e.g. kind-hill-0e0617903.1.azurestaticapps.net)')
param staticWebAppHostname string

@description('Azure Table Storage connection string for activity logging')
@secure()
param storageConnectionString string

@description('Activity events table name')
param activityTableName string = 'ActivityEvents'

var skuTier = skuName == 'F1' ? 'Free' : (skuName == 'B1' ? 'Basic' : 'Standard')
var staticWebAppOrigin = 'https://${staticWebAppHostname}'
var webAppUrl = 'https://${webAppName}.azurewebsites.net'

resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: skuName
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      alwaysOn: skuName != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: [
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: 'Production'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: storageConnectionString
        }
        {
          name: 'AZURE_STORAGE_TABLE_NAME'
          value: activityTableName
        }
        {
          name: 'ACTIVITY_LOG_ENABLED'
          value: 'true'
        }
        {
          name: 'SITE_URL'
          value: frontendOrigin
        }
        {
          name: 'Cors__AllowedOrigins__0'
          value: frontendOrigin
        }
        {
          name: 'Cors__AllowedOrigins__1'
          value: staticWebAppOrigin
        }
        {
          name: 'Cors__AllowedOrigins__2'
          value: 'http://localhost:5173'
        }
      ]
    }
  }
}

output webAppName string = webApp.name
output webAppUrl string = webAppUrl
output defaultHostname string = '${webAppName}.azurewebsites.net'
