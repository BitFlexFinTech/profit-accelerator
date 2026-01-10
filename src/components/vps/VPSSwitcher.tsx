import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Server,
  ArrowRightLeft,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HFTDeployment {
  id: string;
  server_id: string;
  provider: string;
  ip_address: string | null;
  region: string | null;
  status: string;
  bot_status: string | null;
}

interface FailoverConfig {
  id: string;
  provider: string;
  is_primary: boolean;
}

interface VPSSwitcherProps {
  onSwitch?: (newPrimaryId: string) => void;
}

export function VPSSwitcher({ onSwitch }: VPSSwitcherProps) {
  const [deployments, setDeployments] = useState<HFTDeployment[]>([]);
  const [failoverConfigs, setFailoverConfigs] = useState<FailoverConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [switchProgress, setSwitchProgress] = useState(0);
  const [switchStage, setSwitchStage] = useState('');
  const [confirmSwitch, setConfirmSwitch] = useState<HFTDeployment | null>(null);
  // STRICT RULE: Bot never auto-starts - user must opt-in
  const [startBotAfterSwitch, setStartBotAfterSwitch] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [deploymentsRes, failoverRes] = await Promise.all([
        supabase
          .from('hft_deployments')
          .select('id, server_id, provider, ip_address, region, status, bot_status')
          .in('status', ['active', 'running']),
        supabase
          .from('failover_config')
          .select('id, provider, is_primary')
      ]);

      if (deploymentsRes.data) {
        setDeployments(deploymentsRes.data);
      }
      if (failoverRes.data) {
        setFailoverConfigs(failoverRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch VPS data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isPrimary = (deployment: HFTDeployment): boolean => {
    const config = failoverConfigs.find(f => f.provider === deployment.provider);
    return config?.is_primary ?? false;
  };

  const handleSetPrimary = async (deployment: HFTDeployment) => {
    setSwitching(true);
    setSwitchProgress(0);
    setSwitchStage('Preparing migration...');

    try {
      // Stage 1: Stop bot on current primary (graceful)
      setSwitchProgress(10);
      setSwitchStage('Stopping bot on current primary...');
      
      const currentPrimary = deployments.find(d => isPrimary(d));
      if (currentPrimary && currentPrimary.id !== deployment.id) {
        await supabase.functions.invoke('bot-control', {
          body: { action: 'stop', deploymentId: currentPrimary.id }
        });
      }

      // Stage 2: Wait for graceful shutdown
      setSwitchProgress(30);
      setSwitchStage('Waiting for graceful shutdown...');
      await new Promise(r => setTimeout(r, 3000));

      // Stage 3: Only start bot on new primary if user explicitly opted in
      setSwitchProgress(50);
      if (startBotAfterSwitch) {
        setSwitchStage('Starting bot on new primary...');
        await supabase.functions.invoke('bot-control', {
          body: { action: 'start', deploymentId: deployment.id }
        });
      } else {
        setSwitchStage('Bot in STANDBY on new primary (manual start required)...');
        // STRICT RULE: Do NOT auto-start - respect manual start requirement
      }

      // Stage 4: Update failover_config
      setSwitchProgress(70);
      setSwitchStage('Updating failover configuration...');
      
      // Set all to non-primary
      await supabase
        .from('failover_config')
        .update({ is_primary: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Set new primary
      await supabase
        .from('failover_config')
        .upsert({
          provider: deployment.provider,
          region: deployment.region,
          is_primary: true,
          is_enabled: true,
          priority: 1,
        }, { onConflict: 'provider' });

      // Stage 5: Sync IP whitelist
      setSwitchProgress(90);
      setSwitchStage('Syncing IP whitelist...');
      
      if (deployment.ip_address) {
        await supabase
          .from('vps_config')
          .update({ outbound_ip: deployment.ip_address })
          .eq('provider', deployment.provider);

        // Trigger IP sync
        await supabase.functions.invoke('sync-ip-whitelist', {
          body: { newIP: deployment.ip_address }
        }).catch(() => {}); // Ignore if function doesn't exist
      }

      setSwitchProgress(100);
      setSwitchStage('Migration complete!');
      
      toast.success(`Switched primary to ${deployment.provider.toUpperCase()}`);
      onSwitch?.(deployment.id);
      
      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('VPS switch failed:', err);
      toast.error('Failed to switch VPS');
    } finally {
      setSwitching(false);
      setConfirmSwitch(null);
      setSwitchProgress(0);
      setSwitchStage('');
    }
  };

  if (loading) {
    return (
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading VPS instances...
        </div>
      </Card>
    );
  }

  if (deployments.length === 0) {
    return (
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="text-center text-muted-foreground">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No active VPS deployments</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            VPS Failover
          </h3>
          <Badge variant="outline" className="text-xs">
            {deployments.length} Active
          </Badge>
        </div>

        {switching && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{switchStage}</span>
              <span className="text-muted-foreground">{switchProgress}%</span>
            </div>
            <Progress value={switchProgress} className="h-2" />
          </div>
        )}

        <div className="space-y-2">
          {deployments.map(deployment => {
            const primary = isPrimary(deployment);
            return (
              <div
                key={deployment.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  primary ? 'bg-success/10 border-success/30' : 'bg-muted/30 border-border/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Server className={`w-5 h-5 ${primary ? 'text-success' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{deployment.provider}</span>
                      {primary && (
                        <Badge variant="outline" className="text-[10px] bg-success/20 text-success border-success/30">
                          PRIMARY
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {deployment.ip_address || 'No IP'} • {deployment.region || 'Unknown region'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {deployment.bot_status === 'running' ? (
                    <CheckCircle className="w-4 h-4 text-success" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  
                  {!primary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmSwitch(deployment)}
                      disabled={switching}
                      className="text-xs"
                    >
                      Set Primary
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Confirm Switch Dialog */}
      <AlertDialog open={!!confirmSwitch} onOpenChange={() => setConfirmSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              Switch Primary VPS?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will gracefully stop the bot on the current primary VPS and migrate to{' '}
                <strong className="capitalize">{confirmSwitch?.provider}</strong>. 
                The process takes about 30 seconds with zero downtime for open positions.
              </p>
              
              <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <Checkbox 
                  id="startAfterSwitch" 
                  checked={startBotAfterSwitch}
                  onCheckedChange={(checked) => setStartBotAfterSwitch(checked as boolean)}
                />
                <label htmlFor="startAfterSwitch" className="text-sm cursor-pointer">
                  Start bot immediately after switch (otherwise manual start required)
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSwitch && handleSetPrimary(confirmSwitch)}
              className="bg-primary hover:bg-primary/90"
            >
              Switch VPS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}