import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UpdateVPSApiButtonProps {
  ip?: string;
  className?: string;
}

export function UpdateVPSApiButton({ ip, className }: UpdateVPSApiButtonProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setSuccess(false);

    try {
      const { data, error } = await supabase.functions.invoke('push-bot-api-update', {
        body: { ip },
      });

      if (error) {
        toast.error('Update failed', { description: error.message });
        return;
      }

      if (data?.success) {
        setSuccess(true);
        toast.success('VPS API Updated', {
          description: `Successfully updated ${data.ip}. Health: ${data.healthCheck?.ok ? 'OK' : 'Checking...'}`,
        });
        
        // Reset success state after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        toast.error('Update failed', { description: data?.error || 'Unknown error' });
      }
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Update failed', { description: 'Network error' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUpdate}
      disabled={isUpdating}
      className={className}
    >
      {isUpdating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Updating...
        </>
      ) : success ? (
        <>
          <CheckCircle className="h-4 w-4 mr-2 text-success" />
          Updated
        </>
      ) : (
        <>
          <Upload className="h-4 w-4 mr-2" />
          Update VPS API
        </>
      )}
    </Button>
  );
}
