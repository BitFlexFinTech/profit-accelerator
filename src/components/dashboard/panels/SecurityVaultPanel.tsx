import { useState, useEffect } from 'react';
import { Key, Shield, Loader2, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface EncryptionStatus {
  initialized: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccessed: string | null;
  version: number;
}

export function SecurityVaultPanel() {
  const [status, setStatus] = useState<EncryptionStatus>({
    initialized: false,
    createdAt: null,
    updatedAt: null,
    lastAccessed: null,
    version: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'get-encryption-status' }
      });

      if (error) throw error;

      if (data?.success) {
        setStatus({
          initialized: data.initialized,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          lastAccessed: data.lastAccessed,
          version: data.version
        });
      }
    } catch (err) {
      console.error('Failed to fetch encryption status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'init-encryption-key' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Encryption key initialized successfully');
        setStatus(prev => ({
          ...prev,
          initialized: true,
          version: data.version || 1,
          createdAt: new Date().toISOString()
        }));
      } else {
        throw new Error(data?.error || 'Failed to initialize');
      }
    } catch (err: any) {
      toast.error(`Failed to initialize: ${err.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <Key className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Security Vault</h3>
          <p className="text-sm text-muted-foreground">Encryption keys and credential security</p>
        </div>
        {status.initialized ? (
          <span className="px-3 py-1 rounded-full bg-success/20 text-success text-sm flex items-center gap-1">
            <Shield className="w-4 h-4" /> Secured
          </span>
        ) : (
          <span className="px-3 py-1 rounded-full bg-warning/20 text-warning text-sm">
            Not Initialized
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-xs mb-1">Status</p>
          <p className={`font-medium ${status.initialized ? 'text-success' : 'text-warning'}`}>
            {status.initialized ? 'Active' : 'Not Set'}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-xs mb-1">Algorithm</p>
          <p className="font-medium font-mono text-sm">AES-256-GCM</p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-xs mb-1">Key Version</p>
          <p className="font-medium">v{status.version}</p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-xs mb-1">Created</p>
          <p className="font-medium text-sm">{formatDate(status.createdAt)}</p>
        </div>
      </div>

      {status.initialized && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Clock className="w-4 h-4" />
          <span>Last accessed: {formatDate(status.lastAccessed)}</span>
        </div>
      )}

      <div className="flex gap-2">
        {!status.initialized ? (
          <Button onClick={handleInitialize} disabled={isInitializing} className="flex-1">
            {isInitializing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Key className="w-4 h-4 mr-2" />
            )}
            Initialize Encryption Key
          </Button>
        ) : (
          <Button variant="outline" onClick={fetchStatus} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Status
          </Button>
        )}
      </div>
    </div>
  );
}
