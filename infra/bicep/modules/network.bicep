@description('Environment name prefix')
param envName string

@description('Azure region')
param location string

var vnetName = '${envName}-vnet'

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/14']
    }
    subnets: [
      {
        name: 'aks-subnet'
        properties: {
          addressPrefix: '10.0.0.0/16'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: 'apim-subnet'
        properties: {
          addressPrefix: '10.1.0.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: 'postgres-subnet'
        properties: {
          addressPrefix: '10.1.1.0/24'
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'redis-subnet'
        properties: {
          addressPrefix: '10.1.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: 'private-endpoints-subnet'
        properties: {
          addressPrefix: '10.1.3.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      // /23 minimum recommended for ACA Consumption + Workload Profiles environments.
      {
        name: 'aca-subnet'
        properties: {
          addressPrefix: '10.2.0.0/23'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource postgresDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${envName}.private.postgres.database.azure.com'
  location: 'global'
}

resource dnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDnsZone
  name: '${envName}-pg-dns-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnet.id
    }
    registrationEnabled: false
  }
}

output vnetId string = vnet.id
output aksSubnetId string = vnet.properties.subnets[0].id
output apimSubnetId string = vnet.properties.subnets[1].id
output postgresSubnetId string = vnet.properties.subnets[2].id
output redisSubnetId string = vnet.properties.subnets[3].id
output privateEndpointsSubnetId string = vnet.properties.subnets[4].id
output acaSubnetId string = vnet.properties.subnets[5].id
output postgresDnsZoneId string = postgresDnsZone.id
