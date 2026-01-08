import { Button } from '@/components/ui/button';
import { Loader2, Check, AlertCircle, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveButtonProps {
  saving: boolean;
  isDirty: boolean;
  status: 'idle' | 'success' | 'error';
  onClick: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

export function SaveButton({
  saving,
  isDirty,
  status,
  onClick,
  onCancel,
  disabled,
  className,
}: SaveButtonProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Button
        onClick={onClick}
        disabled={disabled || saving || (!isDirty && status !== 'error')}
        className={cn(
          'gap-2 min-w-[100px]',
          status === 'success' && 'bg-success hover:bg-success/90',
          status === 'error' && 'bg-destructive hover:bg-destructive/90'
        )}
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {!saving && status === 'success' && <Check className="w-4 h-4" />}
        {!saving && status === 'error' && <AlertCircle className="w-4 h-4" />}
        {!saving && status === 'idle' && <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : status === 'success' ? 'Saved!' : 'Save'}
      </Button>

      {isDirty && onCancel && (
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}

      {isDirty && !saving && (
        <span className="flex items-center gap-1.5 text-sm text-warning">
          <AlertCircle className="w-3.5 h-3.5" />
          Unsaved changes
        </span>
      )}
    </div>
  );
}
