targetScope = 'resourceGroup'

@description('Name of the Static Web App')
param staticWebAppName string

@description('Azure region')
param location string

resource swa 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output staticWebAppName string = swa.name
output defaultHostname string = swa.properties.defaultHostname
