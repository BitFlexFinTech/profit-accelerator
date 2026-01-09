import { useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

interface ResetDataButtonProps {
  variant?: 'default' | 'compact';
}

export function ResetDataButton({ variant = 'default' }: ResetDataButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const syncFromDatabase = useAppStore((state) => state.syncFromDatabase);

  const handleReset = async () => {
    setIsResetting(true);
    
    try {
      toast.loading('Resetting all trading data...', { id: 'reset-data' });

      const { data, error } = await supabase.functions.invoke('reset-trading-data', {
        body: { confirm: 'RESET_ALL_DATA' },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Reset failed');
      }

      // Force refresh all dashboard data from database
      await syncFromDatabase();

      toast.success(
        `Reset complete: ${data.summary.tables_cleared} tables cleared`,
        { id: 'reset-data' }
      );

      setIsOpen(false);

      // Reload the page to ensure all components refresh
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('[RESET] Error:', error);
      toast.error(`Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: 'reset-data',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {variant === 'compact' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Reset All Data"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="destructive" size="sm" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset All Data
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reset All Trading Data?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p className="font-medium text-foreground">
              This will permanently delete:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>All trade history and journal entries</li>
              <li>Balance history and portfolio snapshots</li>
              <li>AI decision logs and performance metrics</li>
              <li>Trading session records</li>
            </ul>
            <p className="font-medium text-foreground mt-3">
              Your settings will be preserved:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-green-600 dark:text-green-400">
              <li>Exchange API connections</li>
              <li>VPS instances and configurations</li>
              <li>Cloud credentials and strategies</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={isResetting}
            className="gap-2"
          >
            {isResetting ? (
              <>
                <RotateCcw className="h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Reset All Data
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
