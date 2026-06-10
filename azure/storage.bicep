targetScope = 'resourceGroup'

@description('Globally unique storage account name (3–24 lowercase letters and numbers)')
param storageAccountName string

@description('Azure region for the storage account')
param location string

@description('Activity events table name')
param activityTableName string = 'ActivityEvents'

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource activityTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: activityTableName
}

var storageKeys = storage.listKeys()
var connectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storageKeys.keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

output storageAccountName string = storage.name
output activityTableName string = activityTableName
output connectionString string = connectionString
