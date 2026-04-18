@description('Environment name prefix')
param envName string

@description('Azure region')
param location string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string = ''

// Event Hubs namespace – Standard tier for HIPAA-compliant immutable PHI audit stream
resource eventHubNamespace 'Microsoft.EventHub/namespaces@2023-01-01-preview' = {
  name: '${envName}-audit-eh'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    isAutoInflateEnabled: true
    maximumThroughputUnits: 10
    minimumTlsVersion: '1.2'
    disableLocalAuth: false
    zoneRedundant: false
  }
}

// PHI audit events hub – 7-day retention, 4 partitions for parallel consumers
resource phiAuditHub 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'phi-audit-events'
  properties: {
    messageRetentionInDays: 7
    partitionCount: 4
    status: 'Active'
  }
}

// AI decision audit hub – records every triage decision + hallucination guard verdict
resource aiDecisionHub 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ai-decision-events'
  properties: {
    messageRetentionInDays: 30
    partitionCount: 2
    status: 'Active'
  }
}

// Consumer group for SIEM / compliance dashboards
resource siemConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: phiAuditHub
  name: 'siem-consumer'
}

// Consumer group for AI decision analytics
resource analyticsConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: aiDecisionHub
  name: 'analytics-consumer'
}

// Authorization rule – microservices use this Sender key (send-only, no manage/listen)
resource senderRule 'Microsoft.EventHub/namespaces/authorizationRules@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'microservice-sender'
  properties: {
    rights: ['Send']
  }
}

// Authorization rule – SIEM listener (listen-only)
resource listenerRule 'Microsoft.EventHub/namespaces/authorizationRules@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'siem-listener'
  properties: {
    rights: ['Listen']
  }
}

// Diagnostics → Log Analytics
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  scope: eventHubNamespace
  name: 'eventhub-audit-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'ArchiveLogs',       enabled: true }
      { category: 'OperationalLogs',   enabled: true }
      { category: 'AutoScaleLogs',     enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

@description('Event Hubs namespace name')
output namespaceName string = eventHubNamespace.name

@description('Event Hubs sender connection string secret name (stored in Key Vault)')
output senderConnectionStringSecretName string = '${envName}-audit-eh-sender-connection-string'

@description('PHI audit Event Hub name')
output phiAuditHubName string = phiAuditHub.name

@description('AI decision Event Hub name')
output aiDecisionHubName string = aiDecisionHub.name
