// Deploy at subscription scope to create a new resource group and the cheapest web resource (Static Web App Free).
// Usage: az deployment sub create --location <location> --template-file azure/main.bicep --parameters azure/main.parameters.json

targetScope = 'subscription'

@description('Name of the new resource group')
param resourceGroupName string = 'rg-pavillon46'

@description('Azure region for the resource group and Static Web App')
param location string = deployment().location

@description('Name of the Static Web App (website) in the resource group')
param staticWebAppName string = 'pavillon46-swa'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

resource swa 'Microsoft.Web/staticSites@2022-09-01' = {
  scope: rg
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output resourceGroupName string = rg.name
output staticWebAppName string = swa.name
output defaultHostname string = swa.properties.defaultHostname
output deploymentTokenHint string = 'Run: az staticwebapp secrets list --name <staticWebAppName> --resource-group <resourceGroupName> --query properties.apiKey -o tsv'
