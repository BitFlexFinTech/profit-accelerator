import { Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * AutoStartWarningBanner - Displays a confirmation that auto-start is disabled
 * 
 * STRICT RULE: The bot will NEVER start automatically.
 * - VPS reboots leave bot in standby
 * - Container restarts leave bot in standby
 * - Failovers leave bot in standby (unless user opts in)
 * - Only explicit "Start Bot" button triggers trading
 */
export function AutoStartWarningBanner() {
  return (
    <Alert className="border-success/30 bg-success/5">
      <Shield className="h-4 w-4 text-success" />
      <AlertTitle className="text-success">Auto-Start Disabled (Safety Mode)</AlertTitle>
      <AlertDescription className="text-success/80">
        The bot will <strong>NEVER</strong> start automatically. VPS reboots, container restarts, 
        and failovers will leave the bot in standby mode. You must explicitly click 
        "Start Bot" on the dashboard to begin trading.
      </AlertDescription>
    </Alert>
  );
}
