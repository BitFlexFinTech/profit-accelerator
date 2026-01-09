import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, CheckCircle2, ExternalLink, AlertCircle, Key, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AIProviderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Provider {
  provider_name: string;
  display_name: string;
  is_enabled: boolean;
  has_valid_key: boolean;
  daily_usage: number;
  rate_limit_rpd: number;
  error_count: number;
  get_key_url: string;
  color_hex: string;
  secret_name: string;
}

export function AIProviderWizard({ open, onOpenChange }: AIProviderWizardProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const fetchProviders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'get-providers' }
      });
      
      if (error) throw error;
      setProviders(data?.providers || []);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
      toast.error('Failed to load AI providers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProviders();
    }
  }, [open]);

  const handleTestProvider = async (providerName: string) => {
    setTestingProvider(providerName);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'test-provider', provider: providerName }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(`${providerName} API key is valid!`);
        fetchProviders(); // Refresh to show updated status
      } else {
        toast.error(data?.error || `${providerName} validation failed`);
      }
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleToggleProvider = async (providerName: string) => {
    try {
      const { error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'toggle-provider', provider: providerName }
      });
      
      if (error) throw error;
      
      toast.success(`${providerName} toggled`);
      fetchProviders();
    } catch (err) {
      toast.error('Toggle failed');
    }
  };

  const handleResetLimits = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'reset-daily-limits' }
      });
      
      if (error) throw error;
      toast.success('All provider limits reset!');
      fetchProviders();
    } catch (err) {
      toast.error('Reset failed');
    }
  };

  const activeProviders = providers.filter(p => p.is_enabled && p.has_valid_key);
  const totalDailyCapacity = providers.reduce((sum, p) => p.is_enabled && p.has_valid_key ? sum + (p.rate_limit_rpd || 0) : sum, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card/95 backdrop-blur-xl border-primary/20 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Brain className="h-6 w-6 text-primary" />
            AI Provider Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary">{activeProviders.length}</p>
              <p className="text-xs text-muted-foreground">Active Providers</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">{totalDailyCapacity.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Daily Capacity</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleResetLimits}
                className="w-full h-full"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset Limits
              </Button>
            </div>
          </div>

          {/* Provider List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => {
                const usagePercent = provider.rate_limit_rpd 
                  ? Math.round((provider.daily_usage / provider.rate_limit_rpd) * 100) 
                  : 0;
                
                return (
                  <div 
                    key={provider.provider_name}
                    className={`p-4 rounded-lg border transition-colors ${
                      provider.is_enabled && provider.has_valid_key
                        ? 'bg-secondary/30 border-primary/30'
                        : 'bg-muted/20 border-border/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: provider.color_hex || '#888' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{provider.display_name}</span>
                            {provider.has_valid_key && (
                              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                            )}
                            {provider.error_count > 0 && (
                              <span className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {provider.error_count} errors
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{provider.daily_usage}/{provider.rate_limit_rpd} ({usagePercent}%)</span>
                            {!provider.has_valid_key && (
                              <span className="text-warning">No API key</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={provider.get_key_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                          title="Get API Key"
                        >
                          <Key className="h-4 w-4 text-muted-foreground" />
                        </a>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestProvider(provider.provider_name)}
                          disabled={testingProvider === provider.provider_name}
                          className="h-8"
                        >
                          {testingProvider === provider.provider_name ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant={provider.is_enabled ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleProvider(provider.provider_name)}
                          className="h-8 min-w-[70px]"
                        >
                          {provider.is_enabled ? 'Active' : 'Disabled'}
                        </Button>
                      </div>
                    </div>

                    {/* Usage Bar */}
                    <div className="mt-2 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${Math.min(usagePercent, 100)}%`,
                          backgroundColor: usagePercent > 90 ? '#ef4444' : usagePercent > 70 ? '#f59e0b' : provider.color_hex || '#22c55e'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Help Text */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">How to add API keys:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click the <Key className="h-3 w-3 inline" /> icon to get an API key from the provider</li>
              <li>Add the key to <a 
                href="https://supabase.com/dashboard/project/iibdlazwkossyelyroap/settings/functions" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Supabase Secrets <ExternalLink className="h-3 w-3" />
              </a></li>
              <li>Click <Zap className="h-3 w-3 inline" /> to test the connection</li>
            </ol>
          </div>

          <Button onClick={() => onOpenChange(false)} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
