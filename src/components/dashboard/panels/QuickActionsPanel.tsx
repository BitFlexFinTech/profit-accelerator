import { Zap, StopCircle, RefreshCw, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickActionsPanel() {
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-success/10 hover:border-success/50">
          <Zap className="w-5 h-5 text-success" />
          <span className="text-sm">Start Trading</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-destructive/10 hover:border-destructive/50">
          <StopCircle className="w-5 h-5 text-destructive" />
          <span className="text-sm">Pause All</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-accent/10 hover:border-accent/50">
          <RefreshCw className="w-5 h-5 text-accent" />
          <span className="text-sm">Sync Balances</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/50">
          <Bell className="w-5 h-5 text-primary" />
          <span className="text-sm">Test Alert</span>
        </Button>
      </div>
    </div>
  );
}
