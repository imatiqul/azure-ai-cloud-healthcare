// ── Azure AD B2C Tenant ───────────────────────────────────────────────────────
// Creates a B2C directory for patient-facing authentication.
//
// MANUAL STEPS required after deployment (cannot be automated via Bicep):
//   1. In the new B2C tenant, create a user flow:
//      Portal → Azure AD B2C → User flows → New user flow
//      Type: Sign up and sign in (Recommended)
//      Name: B2C_1_signup_signin
//      Identity providers: Email signup
//      Enable MFA: Email OTP (Phase 2) or SMS OTP (Phase 3)
//      User attributes: Given name, Surname, Email address
//      Application claims: Given name, Surname, Email addresses, User's Object ID
//   2. Register the engagement-mfe SPA:
//      App registrations → New registration
//      Name: healthq-engagement-mfe
//      Redirect URI: SPA → https://<engagement-mfe-host>/auth/callback
//      Enable: Access tokens, ID tokens
//   3. Register the backend API:
//      App registrations → New registration
//      Name: healthq-api
//      Expose an API → Add scope: patient.access (user_impersonation)
//   4. Store the following values in Key Vault (see outputs below for tenant domain):
//      healthq-b2c-tenant-domain  → <envName>healthq.onmicrosoft.com
//      healthq-b2c-client-id      → Application (client) ID of healthq-engagement-mfe
//      healthq-b2c-api-client-id  → Application (client) ID of healthq-api
//
// Reference: https://learn.microsoft.com/en-us/azure/active-directory-b2c/

@description('Environment name prefix')
param envName string

@description('Country code for the B2C tenant (e.g., US)')
param countryCode string = 'US'

@description('Key Vault resource ID to store B2C configuration secrets')
param keyVaultId string

// B2C tenant name must be globally unique — use envName as prefix
var b2cDomainName = '${replace(envName, '-', '')}healthq'
var b2cTenantDomain = '${b2cDomainName}.onmicrosoft.com'

// ── B2C Directory ─────────────────────────────────────────────────────────────
// This creates the Azure AD B2C tenant at the subscription scope.
// After creation the tenant ID is available as a property; user flows and
// app registrations must be configured within the new tenant.
resource b2cDirectory 'Microsoft.AzureActiveDirectory/b2cDirectories@2021-04-01' = {
  name: b2cTenantDomain
  location: 'United States'
  sku: {
    name: 'PremiumP1'
    tier: 'A0'
  }
  properties: {
    createTenantProperties: {
      displayName: '${envName} HealthQ Copilot'
      countryCode: countryCode
    }
  }
}

// ── Key Vault — B2C configuration secrets ────────────────────────────────────
// Stores the B2C tenant domain so services can read auth configuration from KV.
// Client ID secrets must be populated manually after app registrations are created.
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultId, '/'))
}

resource b2cTenantDomainSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'healthq-b2c-tenant-domain'
  properties: {
    value: b2cTenantDomain
    attributes: { enabled: true }
  }
}

resource b2cAuthoritySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'healthq-b2c-authority'
  properties: {
    // Populated once the B2C_1_signup_signin user flow is created
    value: 'https://${b2cDomainName}.b2clogin.com/${b2cTenantDomain}/B2C_1_signup_signin/v2.0'
    attributes: { enabled: true }
  }
}

// Client ID secrets are placeholders — set real values after app registrations
resource b2cClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'healthq-b2c-client-id'
  properties: {
    value: 'REPLACE_WITH_ENGAGEMENT_MFE_APP_CLIENT_ID'
    attributes: { enabled: true }
  }
}

resource b2cApiClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'healthq-b2c-api-client-id'
  properties: {
    value: 'REPLACE_WITH_API_APP_CLIENT_ID'
    attributes: { enabled: true }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output b2cTenantDomain string = b2cTenantDomain
output b2cTenantId string = b2cDirectory.properties.tenantId
output b2cAuthority string = 'https://${b2cDomainName}.b2clogin.com/${b2cTenantDomain}/B2C_1_signup_signin/v2.0'
output b2cSignUpSignInPolicyName string = 'B2C_1_signup_signin'
output b2cPasswordResetPolicyName string = 'B2C_1_password_reset'
