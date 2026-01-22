// Deploy at subscription scope to create a new resource group and the cheapest web resource (Static Web App Free).
// Usage: az deployment sub create --location <location> --template-file azure/main.bicep --parameters azure/main.parameters.json

targetScope = 'subscription'

@description('Name of the new resource group')
param resourceGroupName string = 'rg-pavillon46'

@description('Azure region for the resource group (e.g. italynorth)')
param location string = deployment().location

@description('Azure region for the Static Web App. Must be a supported SWA region: westeurope, eastus2, westus2, centralus, eastasia.')
param staticWebAppLocation string = 'westeurope'

@description('Name of the Static Web App (website) in the resource group')
param staticWebAppName string = 'pavillon46-swa'

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

output resourceGroupName string = rg.name
output staticWebAppName string = swaModule.outputs.staticWebAppName
output defaultHostname string = swaModule.outputs.defaultHostname
output deploymentTokenHint string = 'Run: az staticwebapp secrets list -n <staticWebAppName> -g <resourceGroupName> --query properties.apiKey -o tsv'
