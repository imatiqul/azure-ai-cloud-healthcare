@description('Environment name prefix')
param envName string

@description('Azure region')
param location string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

@description('ACR login server for image pulls')
param acrLoginServer string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('Container app definitions')
param services array = [
  { name: 'voice', port: 8080, minReplicas: 1, maxReplicas: 5 }
  { name: 'ai-agent', port: 8080, minReplicas: 1, maxReplicas: 10 }
  { name: 'fhir', port: 8080, minReplicas: 1, maxReplicas: 3 }
  { name: 'identity', port: 8080, minReplicas: 1, maxReplicas: 3 }
  { name: 'ocr', port: 8080, minReplicas: 0, maxReplicas: 10 }
  { name: 'scheduling', port: 8080, minReplicas: 1, maxReplicas: 5 }
  { name: 'notification', port: 8080, minReplicas: 0, maxReplicas: 5 }
  { name: 'pop-health', port: 8080, minReplicas: 1, maxReplicas: 3 }
  { name: 'revenue', port: 8080, minReplicas: 1, maxReplicas: 5 }
]

resource acaEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${envName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource containerApps 'Microsoft.App/containerApps@2024-03-01' = [for svc in services: {
  name: svc.name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: acaEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: svc.port
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: managedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: svc.name
          image: '${acrLoginServer}/healthq-copilot-${svc.name}:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/alive'
                port: svc.port
              }
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: svc.port
              }
              periodSeconds: 5
            }
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: svc.port
              }
              failureThreshold: 30
              periodSeconds: 2
            }
          ]
        }
      ]
      scale: {
        minReplicas: svc.minReplicas
        maxReplicas: svc.maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}]

output environmentId string = acaEnvironment.id
output environmentFqdn string = acaEnvironment.properties.defaultDomain
output serviceUrls array = [for (svc, i) in services: {
  name: svc.name
  fqdn: containerApps[i].properties.configuration.ingress.fqdn
}]
