import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * AutoStartWarningBanner - Displays a confirmation that auto-start is disabled
 * 
 * STRICT RULE: The bot will NEVER start automatically.
 * - VPS reboots leave bot in standby
 * - Container restarts leave bot in standby
 * - Failovers leave bot in standby (unless user opts in)
 * - Only explicit "Start Bot" button triggers trading
 * 
 * DISMISSABLE: User can dismiss this banner (strict rule)
 */
export function AutoStartWarningBanner() {
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed) return null;
  
  return (
    <Alert className="border-success/30 bg-success/5 relative">
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute top-2 right-2 h-6 w-6 text-success/60 hover:text-success hover:bg-success/10"
        onClick={() => setDismissed(true)}
      >
        <X className="w-4 h-4" />
      </Button>
      <Shield className="h-4 w-4 text-success" />
      <AlertTitle className="text-success pr-8">Auto-Start Disabled (Safety Mode)</AlertTitle>
      <AlertDescription className="text-success/80">
        The bot will <strong>NEVER</strong> start automatically. VPS reboots, container restarts, 
        and failovers will leave the bot in standby mode. You must explicitly click 
        "Start Bot" on the dashboard to begin trading.
      </AlertDescription>
    </Alert>
  );
}
