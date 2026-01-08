import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bot, Server, Play, Copy, CheckCircle2, Terminal, Zap, Globe, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { IconContainer } from '@/components/ui/IconContainer';

interface OctoBotWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OctoBotWizard({ open, onOpenChange }: OctoBotWizardProps) {
  const [step, setStep] = useState(1);
  const [vpsId, setVpsId] = useState('');
  const [selectedVpsIp, setSelectedVpsIp] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vpsInstances, setVpsInstances] = useState<{ id: string; name: string; ip: string }[]>([]);

  useEffect(() => {
    const fetchVPS = async () => {
      const { data } = await supabase
        .from('vps_instances')
        .select('id, name, ip_address')
        .eq('status', 'running');
      if (data) {
        setVpsInstances(data.map(v => ({ id: v.id, name: v.name || 'VPS', ip: v.ip_address || '' })));
      }
    };
    fetchVPS();
  }, []);

  const handleVpsSelect = (id: string) => {
    setVpsId(id);
    const vps = vpsInstances.find(v => v.id === id);
    setSelectedVpsIp(vps?.ip || '');
  };

  const dockerCommands = `# Create OctoBot directory
mkdir -p ~/octobot/user && cd ~/octobot

# Run OctoBot Docker container
docker run -d \\
  --name octobot \\
  -p 5001:5001 \\
  -v ~/octobot/user:/octobot/user \\
  --restart unless-stopped \\
  drakkarsoftware/octobot:stable

# Check container status
docker ps | grep octobot

# View logs
docker logs -f octobot`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeploy = async () => {
    if (!vpsId) {
      toast.error('Please select a VPS');
      return;
    }

    setIsDeploying(true);
    try {
      const { error } = await supabase.functions.invoke('ssh-command', {
        body: {
          instanceId: vpsId,
          command: dockerCommands.split('\n').filter(l => !l.startsWith('#') && l.trim()).join(' && ')
        }
      });

      if (error) throw error;
      toast.success('OctoBot deployment started!');
      setStep(2);
    } catch (err) {
      console.error('Deploy error:', err);
      toast.error('Failed to deploy OctoBot');
    } finally {
      setIsDeploying(false);
    }
  };

  const webUIUrl = selectedVpsIp ? `http://${selectedVpsIp}:5001` : 'http://YOUR_VPS_IP:5001';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-red-500/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconContainer color="red" size="lg" animated>
              <Bot className="w-6 h-6" />
            </IconContainer>
            <div>
              <DialogTitle className="text-xl">OctoBot Wizard</DialogTitle>
              <DialogDescription>
                Deploy OctoBot - Customizable trading bot with web interface
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 my-4">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                step >= s 
                  ? 'bg-red-500 text-white' 
                  : 'bg-secondary text-muted-foreground'
              )}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 2 && (
                <div className={cn(
                  "w-12 h-0.5 transition-colors",
                  step > s ? 'bg-red-500' : 'bg-secondary'
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: VPS Selection & Deploy */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-red-400" />
                VPS Requirements
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 2GB+ RAM</li>
                <li>• Docker installed</li>
                <li>• Port 5001 open for Web UI</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-green-400" />
                Features
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Web-based configuration interface</li>
                <li>• Multiple strategy modules</li>
                <li>• Telegram bot integration</li>
                <li>• Backtesting support</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Select VPS Instance</Label>
              <Select value={vpsId} onValueChange={handleVpsSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a VPS..." />
                </SelectTrigger>
                <SelectContent>
                  {vpsInstances.length === 0 ? (
                    <SelectItem value="none" disabled>No VPS available</SelectItem>
                  ) : (
                    vpsInstances.map((vps) => (
                      <SelectItem key={vps.id} value={vps.id}>
                        {vps.name} ({vps.ip})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Docker Commands</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(dockerCommands)}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 text-xs text-red-400 overflow-x-auto font-mono">
                {dockerCommands}
              </pre>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleCopy(dockerCommands)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Commands
                </Button>
                <Button 
                  onClick={handleDeploy}
                  disabled={isDeploying || !vpsId}
                  className="bg-red-500 hover:bg-red-600"
                >
                  {isDeploying ? (
                    <>Deploying...</>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Deploy Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Complete */}
        {step === 2 && (
          <div className="space-y-4 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold">OctoBot Deployed!</h3>
            <p className="text-muted-foreground">
              Your bot is now running with a web interface.
            </p>

            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4 text-red-400" />
                  Web Interface URL
                </p>
                <Badge variant="outline" className="border-red-500/30 text-red-400">
                  Port 5001
                </Badge>
              </div>
              <a 
                href={webUIUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-lg bg-black/30 hover:bg-black/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <code className="text-sm text-green-400">{webUIUrl}</code>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-red-400" />
                </div>
              </a>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 text-left space-y-2">
              <p className="font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                Useful Commands
              </p>
              <pre className="text-xs text-muted-foreground font-mono">
{`# View logs
docker logs -f octobot

# Stop OctoBot
docker stop octobot

# Restart OctoBot
docker restart octobot

# Update OctoBot
docker pull drakkarsoftware/octobot:stable
docker stop octobot && docker rm octobot
# Then run docker run command again`}
              </pre>
            </div>

            <Button onClick={() => onOpenChange(false)} className="bg-red-500 hover:bg-red-600">
              <Zap className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
