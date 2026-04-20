targetScope = 'subscription'

@description('Environment name prefix for all resources')
param envName string

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Entra ID tenant ID for AKS AAD integration')
param aadTenantId string

@description('Log Analytics workspace retention in days')
param logRetentionDays int = 90

@description('APIM publisher email')
param apimPublisherEmail string

@description('Country code for the Azure AD B2C tenant (ISO 3166-1 alpha-2)')
param b2cCountryCode string = 'US'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${envName}-rg'
  location: location
}

module network 'modules/network.bicep' = {
  name: 'network-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
  }
}

module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'log-analytics-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    retentionDays: logRetentionDays
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
  }
}

module aks 'modules/aks.bicep' = {
  name: 'aks-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    aadTenantId: aadTenantId
    aksSubnetId: network.outputs.aksSubnetId
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

module dapr 'modules/dapr-extension.bicep' = {
  name: 'dapr-deploy'
  scope: rg
  params: {
    aksClusterName: aks.outputs.clusterName
  }
}

module apim 'modules/apim.bicep' = {
  name: 'apim-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    apimSubnetId: network.outputs.apimSubnetId
    publisherEmail: apimPublisherEmail
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'servicebus-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    pgSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.postgresDnsZoneId
  }
}

module redis 'modules/redis.bicep' = {
  name: 'redis-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    redisSubnetId: network.outputs.redisSubnetId
  }
}

module identities 'modules/managed-identities.bicep' = {
  name: 'identities-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    aksOidcIssuer: aks.outputs.oidcIssuerUrl
    keyVaultId: keyVault.outputs.keyVaultId
    serviceBusNamespaceId: serviceBus.outputs.namespaceId
  }
}

module appInsights 'modules/app-insights.bicep' = {
  name: 'app-insights-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

// Azure Web PubSub – real-time server→client push (replaces SignalR)
// Delivers AI thinking tokens, triage results and transcript chunks to the voice MFE
module webPubSub 'modules/web-pubsub.bicep' = {
  name: 'web-pubsub-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

// Azure AD B2C – patient-facing auth (sign-up/sign-in, PKCE, MFA)
// Deployed at subscription scope because B2C is a separate tenant.
// IMPORTANT: After deployment, complete manual steps documented in modules/b2c.bicep.
module b2c 'modules/b2c.bicep' = {
  name: 'b2c-deploy'
  scope: rg
  params: {
    envName: envName
    countryCode: b2cCountryCode
    keyVaultId: keyVault.outputs.keyVaultId
  }
  dependsOn: [keyVault]
}

// Azure Event Hubs – HIPAA-compliant immutable audit stream for all PHI access + AI decisions
module eventHubs 'modules/event-hubs.bicep' = {
  name: 'event-hubs-deploy'
  scope: rg
  params: {
    envName: envName
    location: location
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

output aksClusterName string = aks.outputs.clusterName
output acrLoginServer string = acr.outputs.loginServer
output apimGatewayUrl string = apim.outputs.gatewayUrl
output keyVaultName string = keyVault.outputs.keyVaultName
output webPubSubEndpoint string = webPubSub.outputs.endpoint
output eventHubsNamespace string = eventHubs.outputs.namespaceName
output b2cTenantDomain string = b2c.outputs.b2cTenantDomain
output b2cAuthority string = b2c.outputs.b2cAuthority
