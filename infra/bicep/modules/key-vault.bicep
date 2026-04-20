@description('Environment name prefix')
param envName string

@description('Azure region')
param location string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${envName}-kv'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

// Diagnostic settings for HIPAA audit
resource kvDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${envName}-kv-diag'
  scope: keyVault
  properties: {
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri

// ── VAPID Web-Push secrets ────────────────────────────────────────────────────
// Generate with: npx web-push generate-vapid-keys
// Set actual values via: az keyvault secret set --vault-name <vault> --name healthq-vapid-public-key --value <key>
resource vapidPublicKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'healthq-vapid-public-key'
  properties: {
    value: 'REPLACE_WITH_GENERATED_VAPID_PUBLIC_KEY'
    attributes: { enabled: true }
  }
}

resource vapidPrivateKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'healthq-vapid-private-key'
  properties: {
    value: 'REPLACE_WITH_GENERATED_VAPID_PRIVATE_KEY'
    attributes: { enabled: true }
  }
}
