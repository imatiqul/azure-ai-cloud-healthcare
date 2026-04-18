@description('Environment name prefix')
param envName string

@description('Azure region')
param location string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string = ''

// Azure Web PubSub – Standard tier, 1 unit, "voice" hub
// Replaces SignalR for real-time server→client push (AI thinking tokens, triage results, transcript chunks)
resource webPubSub 'Microsoft.SignalRService/webPubSub@2023-02-01' = {
  name: '${envName}-voice-wps'
  location: location
  sku: {
    name: 'Standard_S1'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    tls: {
      clientCertEnabled: false
    }
    liveTraceConfiguration: {
      enabled: 'true'
      categories: [
        { name: 'ConnectivityLogs', enabled: 'true' }
        { name: 'MessagingLogs',    enabled: 'true' }
      ]
    }
  }
}

// Hub definition – "voice" hub with anonymous connect disabled, event handlers for Voice service
resource voiceHub 'Microsoft.SignalRService/webPubSub/hubs@2023-02-01' = {
  parent: webPubSub
  name: 'voice'
  properties: {
    eventHandlers: [
      {
        // Registered for connect/disconnect/message events (optional for pure server-push model)
        urlTemplate: 'https://${envName}-voice.internal/eventhandler'
        userEventPattern: '*'
        systemEvents: ['connect', 'disconnected']
      }
    ]
    anonymousConnectPolicy: 'deny'
  }
}

// Diagnostics → Log Analytics
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  scope: webPubSub
  name: 'voice-wps-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'ConnectivityLogs', enabled: true }
      { category: 'MessagingLogs',    enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

@description('Azure Web PubSub endpoint URL')
output endpoint string = 'https://${webPubSub.properties.hostName}'

@description('Azure Web PubSub resource name')
output resourceName string = webPubSub.name

@description('Primary connection string (via Key Vault secret reference)')
output connectionStringSecretName string = '${envName}-voice-wps-connection-string'
