import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get Azure OAuth2 access token
async function getAzureToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://management.azure.com/.default'
      })
    }
  );

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Azure Auth Error: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

// Make Azure REST API request
async function azureRequest(
  method: string,
  url: string,
  token: string,
  body?: any
): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  
  if (!response.ok) {
    console.error('Azure API Error:', text);
    throw new Error(`Azure API Error: ${response.status} - ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      action, 
      tenantId,
      clientId,
      clientSecret,
      subscriptionId,
      resourceGroup = 'hft-bot-rg',
      location = 'japaneast',
      vmName = 'hft-bot-tokyo'
    } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'validate-credentials': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        
        // List subscriptions to validate
        const result = await azureRequest(
          'GET',
          'https://management.azure.com/subscriptions?api-version=2022-12-01',
          token
        );

        const subscriptions = result.value || [];
        const targetSub = subscriptions.find((s: any) => s.subscriptionId === subscriptionId);

        return new Response(JSON.stringify({
          success: true,
          subscriptionId: targetSub?.subscriptionId,
          displayName: targetSub?.displayName,
          state: targetSub?.state,
          message: 'Azure credentials validated successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'deploy-instance': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;

        // Create resource group if not exists
        try {
          await azureRequest(
            'PUT',
            `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=2021-04-01`,
            token,
            { location }
          );
        } catch (e) {
          console.log('Resource group might already exist');
        }

        // Create virtual network
        const vnetName = 'hft-bot-vnet';
        await azureRequest(
          'PUT',
          `${baseUrl}/providers/Microsoft.Network/virtualNetworks/${vnetName}?api-version=2023-05-01`,
          token,
          {
            location,
            properties: {
              addressSpace: { addressPrefixes: ['10.0.0.0/16'] },
              subnets: [{ name: 'default', properties: { addressPrefix: '10.0.0.0/24' } }]
            }
          }
        );

        // Create public IP
        const publicIpName = 'hft-bot-ip';
        await azureRequest(
          'PUT',
          `${baseUrl}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}?api-version=2023-05-01`,
          token,
          {
            location,
            properties: {
              publicIPAllocationMethod: 'Static',
              publicIPAddressVersion: 'IPv4'
            },
            sku: { name: 'Standard' }
          }
        );

        // Create network security group
        const nsgName = 'hft-bot-nsg';
        await azureRequest(
          'PUT',
          `${baseUrl}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}?api-version=2023-05-01`,
          token,
          {
            location,
            properties: {
              securityRules: [
                {
                  name: 'SSH',
                  properties: {
                    priority: 100,
                    direction: 'Inbound',
                    access: 'Allow',
                    protocol: 'Tcp',
                    sourcePortRange: '*',
                    destinationPortRange: '22',
                    sourceAddressPrefix: '*',
                    destinationAddressPrefix: '*'
                  }
                },
                {
                  name: 'Bot-Port',
                  properties: {
                    priority: 110,
                    direction: 'Inbound',
                    access: 'Allow',
                    protocol: 'Tcp',
                    sourcePortRange: '*',
                    destinationPortRange: '8080',
                    sourceAddressPrefix: '*',
                    destinationAddressPrefix: '*'
                  }
                },
                {
                  name: 'HTTPS',
                  properties: {
                    priority: 120,
                    direction: 'Inbound',
                    access: 'Allow',
                    protocol: 'Tcp',
                    sourcePortRange: '*',
                    destinationPortRange: '443',
                    sourceAddressPrefix: '*',
                    destinationAddressPrefix: '*'
                  }
                }
              ]
            }
          }
        );

        // Create network interface
        const nicName = 'hft-bot-nic';
        await azureRequest(
          'PUT',
          `${baseUrl}/providers/Microsoft.Network/networkInterfaces/${nicName}?api-version=2023-05-01`,
          token,
          {
            location,
            properties: {
              ipConfigurations: [{
                name: 'ipconfig1',
                properties: {
                  privateIPAllocationMethod: 'Dynamic',
                  subnet: {
                    id: `${baseUrl}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/default`
                  },
                  publicIPAddress: {
                    id: `${baseUrl}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}`
                  }
                }
              }],
              networkSecurityGroup: {
                id: `${baseUrl}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}`
              }
            }
          }
        );

        // Wait for NIC to be ready
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Create VM
        const vmResult = await azureRequest(
          'PUT',
          `${baseUrl}/providers/Microsoft.Compute/virtualMachines/${vmName}?api-version=2023-07-01`,
          token,
          {
            location,
            properties: {
              hardwareProfile: { vmSize: 'Standard_B1ls' }, // Free tier eligible
              storageProfile: {
                imageReference: {
                  publisher: 'Canonical',
                  offer: '0001-com-ubuntu-server-jammy',
                  sku: '22_04-lts-gen2',
                  version: 'latest'
                },
                osDisk: {
                  createOption: 'FromImage',
                  managedDisk: { storageAccountType: 'Standard_LRS' }
                }
              },
              osProfile: {
                computerName: vmName,
                adminUsername: 'hftadmin',
                linuxConfiguration: {
                  disablePasswordAuthentication: false,
                  provisionVMAgent: true
                },
                adminPassword: `HFT${crypto.randomUUID().slice(0, 12)}!`
              },
              networkProfile: {
                networkInterfaces: [{
                  id: `${baseUrl}/providers/Microsoft.Network/networkInterfaces/${nicName}`,
                  properties: { primary: true }
                }]
              }
            }
          }
        );

        // Log timeline event
        await supabase.from('vps_timeline_events').insert({
          provider: 'Azure',
          event_type: 'deployment',
          event_subtype: 'started',
          title: 'Azure VM Launching',
          description: `VM ${vmName} is being created in ${location}`,
          metadata: { vmName, location, resourceGroup }
        });

        // Store config
        await supabase.from('cloud_config').upsert({
          provider: 'azure',
          region: location,
          instance_type: 'Standard_B1ls',
          is_active: true,
          status: 'deploying',
          credentials: { tenantId, clientId, subscriptionId, resourceGroup, vmName }
        }, { onConflict: 'provider' });

        return new Response(JSON.stringify({
          success: true,
          vmName,
          resourceGroup,
          location,
          message: 'Azure VM is being created. It will be ready in 2-3 minutes.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-instance-status': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;

        // Get VM status
        const vmResult = await azureRequest(
          'GET',
          `${baseUrl}/providers/Microsoft.Compute/virtualMachines/${vmName}/instanceView?api-version=2023-07-01`,
          token
        );

        const powerState = vmResult.statuses?.find((s: any) => s.code.startsWith('PowerState/'))?.code;
        const status = powerState === 'PowerState/running' ? 'running' : 
                       powerState === 'PowerState/stopped' ? 'stopped' : 'unknown';

        // Get public IP
        const ipResult = await azureRequest(
          'GET',
          `${baseUrl}/providers/Microsoft.Network/publicIPAddresses/hft-bot-ip?api-version=2023-05-01`,
          token
        );

        const publicIp = ipResult.properties?.ipAddress;

        if (status === 'running' && publicIp) {
          await supabase.from('vps_config').upsert({
            provider: 'azure',
            region: location,
            status: 'running',
            outbound_ip: publicIp,
            instance_type: 'Standard_B1ls'
          }, { onConflict: 'provider' });

          await supabase.from('cloud_config').update({ status: 'running' }).eq('provider', 'azure');

          await supabase.from('failover_config').upsert({
            provider: 'azure',
            region: location,
            is_enabled: true,
            health_check_url: `http://${publicIp}:8080/health`
          }, { onConflict: 'provider' });

          await supabase.from('vps_timeline_events').insert({
            provider: 'Azure',
            event_type: 'deployment',
            event_subtype: 'completed',
            title: 'Azure VM Ready',
            description: `VM is running at ${publicIp}`,
            metadata: { vmName, publicIp, status }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          vmName,
          status,
          publicIp,
          powerState
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'stop-instance': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        
        await azureRequest(
          'POST',
          `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}/deallocate?api-version=2023-07-01`,
          token
        );

        await supabase.from('cloud_config').update({ status: 'stopped' }).eq('provider', 'azure');
        await supabase.from('vps_config').update({ status: 'stopped' }).eq('provider', 'azure');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Azure',
          event_type: 'deployment',
          event_subtype: 'stopped',
          title: 'Azure VM Deallocated',
          description: `VM ${vmName} has been deallocated (stopped)`,
          metadata: { vmName }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'VM is being deallocated'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'start-instance': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        
        await azureRequest(
          'POST',
          `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}/start?api-version=2023-07-01`,
          token
        );

        await supabase.from('cloud_config').update({ status: 'starting' }).eq('provider', 'azure');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Azure',
          event_type: 'deployment',
          event_subtype: 'started',
          title: 'Azure VM Starting',
          description: `VM ${vmName} is being started`,
          metadata: { vmName }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'VM is being started'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'terminate-instance': {
        const token = await getAzureToken(tenantId, clientId, clientSecret);
        
        // Delete VM
        await azureRequest(
          'DELETE',
          `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}?api-version=2023-07-01`,
          token
        );

        // Cleanup associated resources
        const resources = ['hft-bot-nic', 'hft-bot-ip', 'hft-bot-nsg'];
        for (const res of resources) {
          try {
            const type = res.includes('nic') ? 'networkInterfaces' :
                        res.includes('ip') ? 'publicIPAddresses' : 'networkSecurityGroups';
            await azureRequest(
              'DELETE',
              `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/${type}/${res}?api-version=2023-05-01`,
              token
            );
          } catch (e) {
            console.log(`Failed to delete ${res}:`, e);
          }
        }

        await supabase.from('cloud_config').update({ 
          status: 'terminated',
          is_active: false 
        }).eq('provider', 'azure');
        await supabase.from('vps_config').delete().eq('provider', 'azure');
        await supabase.from('failover_config').update({ is_enabled: false }).eq('provider', 'azure');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Azure',
          event_type: 'deployment',
          event_subtype: 'terminated',
          title: 'Azure VM Terminated',
          description: `VM ${vmName} and associated resources have been deleted`,
          metadata: { vmName, resourceGroup }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'VM and resources are being deleted'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('Azure Cloud Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
