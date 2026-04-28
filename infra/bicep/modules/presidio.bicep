// W1.1 — Presidio analyzer hosted on Azure Container Apps (internal ingress).
// The HealthQCopilot.Agents service calls this endpoint via PresidioPhiRedactor
// when `Presidio:AnalyzerEndpoint` is configured.
//
// Hosting choice (per Plan §"Further Considerations" #1): an Internal Container
// App in a dedicated managed environment provides predictable per-pod latency
// and lets us scale the analyzer independently of the agent service. The
// `external = false` ingress keeps the analyzer reachable only from inside
// the platform network.

@description('Environment name prefix.')
param envName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Log Analytics workspace ID for ACA diagnostics.')
param logAnalyticsWorkspaceId string

@description('Subnet ID for the ACA managed environment infrastructure.')
param infraSubnetId string

@description('Container image for the Presidio analyzer service. Pinned to a digest in production.')
param analyzerImage string = 'mcr.microsoft.com/presidio-analyzer:latest'

@description('CPU cores per replica (analyzer is NLP-bound, requires generous CPU).')
param cpuCores string = '1.0'

@description('Memory per replica.')
param memory string = '2Gi'

@description('Minimum replicas. Set >= 1 to avoid cold-start on first request.')
@minValue(1)
@maxValue(5)
param minReplicas int = 1

@description('Maximum replicas under load.')
@minValue(1)
@maxValue(20)
param maxReplicas int = 5

@description('Concurrent requests per replica before triggering scale-out.')
param concurrentRequests int = 30

var envFullName = '${envName}-presidio-env'
var appName = '${envName}-presidio-analyzer'

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envFullName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      internal: true
      infrastructureSubnetId: infraSubnetId
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource analyzer 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'presidio-analyzer'
          image: analyzerImage
          resources: {
            cpu: json(cpuCores)
            memory: memory
          }
          env: [
            // Disable Presidio's anonymous telemetry: we run in a HIPAA boundary
            // so no analytics may leave the cluster.
            {
              name: 'ANALYTICS_OPT_OUT'
              value: 'true'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: string(concurrentRequests)
              }
            }
          }
        ]
      }
    }
  }
}

@description('Internal HTTPS endpoint of the Presidio analyzer (use as `Presidio:AnalyzerEndpoint`).')
output analyzerEndpoint string = 'https://${analyzer.properties.configuration.ingress.fqdn}'

@description('FQDN of the analyzer (without scheme).')
output analyzerFqdn string = analyzer.properties.configuration.ingress.fqdn

@description('Managed environment ID — reuse to deploy additional internal services next to Presidio.')
output managedEnvironmentId string = managedEnv.id
