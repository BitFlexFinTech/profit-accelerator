import { useState, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2, CheckCircle2, ExternalLink, AlertCircle, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OpenRouterWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const OPENROUTER_COLOR = '#9B59B6';

export const OpenRouterWizard = forwardRef<HTMLDivElement, OpenRouterWizardProps>(
  function OpenRouterWizard({ open, onOpenChange, onSuccess }, ref) {
    const [step, setStep] = useState(1);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleValidate = async () => {
      if (!apiKey.trim()) {
        setValidationError('Please enter your API key');
        return;
      }

      setIsValidating(true);
      setValidationError(null);

      try {
        // Test the OpenRouter API key
        const testResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'HFT Trading Bot'
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.1-8b-instruct:free',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1
          })
        });

        if (!testResp.ok) {
          const errData = await testResp.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API error: ${testResp.status}`);
        }

        setStep(2);
        toast.success('OpenRouter API key validated!');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Validation failed';
        setValidationError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setIsValidating(false);
      }
    };

    const handleSave = async () => {
      setIsSaving(true);

      try {
        const { error } = await supabase
          .from('ai_providers')
          .update({
            is_enabled: true,
            is_active: true,
            has_secret: true,
            last_used_at: new Date().toISOString()
          })
          .eq('provider_name', 'openrouter');

        if (error) throw error;

        toast.success('OpenRouter configured! Add OPENROUTER_API_KEY to Supabase secrets.');
        setStep(3);
        onSuccess?.();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save';
        toast.error(errorMsg);
      } finally {
        setIsSaving(false);
      }
    };

    const handleClose = () => {
      setStep(1);
      setApiKey('');
      setShowKey(false);
      setValidationError(null);
      onOpenChange(false);
    };

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent ref={ref} className="sm:max-w-md bg-card/95 backdrop-blur-xl border-2" style={{ borderColor: OPENROUTER_COLOR }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${OPENROUTER_COLOR}20` }}>
                <Globe className="h-6 w-6" style={{ color: OPENROUTER_COLOR }} />
              </div>
              OpenRouter
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Progress Steps */}
            <div className="flex items-center justify-between px-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      step >= s ? 'text-white' : 'bg-muted text-muted-foreground'
                    }`}
                    style={{ backgroundColor: step >= s ? OPENROUTER_COLOR : undefined }}
                  >
                    {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div 
                      className="w-16 h-0.5" 
                      style={{ backgroundColor: step > s ? OPENROUTER_COLOR : 'hsl(var(--muted))' }} 
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Enter API Key */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <Key className="h-12 w-12 mx-auto" style={{ color: OPENROUTER_COLOR }} />
                  <h3 className="font-semibold">Enter OpenRouter API Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Free models available, 20 RPM
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="sk-or-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pr-10 bg-background/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm hover:underline"
                  style={{ color: OPENROUTER_COLOR }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Get API key from OpenRouter
                </a>

                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: OPENROUTER_COLOR }}
                  onClick={handleValidate}
                  disabled={isValidating || !apiKey.trim()}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>

                {validationError && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Save Configuration */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <h3 className="font-semibold">API Key Validated!</h3>
                  <p className="text-sm text-muted-foreground">
                    Ready to enable OpenRouter
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Next step:</p>
                  <p className="text-xs text-muted-foreground">
                    Add <code className="bg-background px-1 rounded">OPENROUTER_API_KEY</code> to your Supabase Edge Function secrets
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 text-white"
                    style={{ backgroundColor: OPENROUTER_COLOR }}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enabling...
                      </>
                    ) : (
                      'Enable OpenRouter'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="relative mx-auto w-16 h-16">
                    <Globe className="h-16 w-16" style={{ color: OPENROUTER_COLOR }} />
                    <CheckCircle2 className="h-6 w-6 text-green-500 absolute -bottom-1 -right-1" />
                  </div>
                  <h3 className="font-semibold text-lg">OpenRouter Active!</h3>
                  <p className="text-sm text-muted-foreground">
                    Access to 100+ AI models
                  </p>
                </div>

                <div className="p-4 rounded-lg border" style={{ borderColor: OPENROUTER_COLOR, backgroundColor: `${OPENROUTER_COLOR}10` }}>
                  <p className="text-sm text-center">
                    <span className="font-medium">Priority:</span> 5th in rotation
                  </p>
                </div>

                <Button className="w-full" onClick={handleClose}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

OpenRouterWizard.displayName = 'OpenRouterWizard';
