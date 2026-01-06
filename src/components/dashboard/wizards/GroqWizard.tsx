import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Loader2, CheckCircle2, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAIConfig } from '@/hooks/useAIConfig';

interface GroqWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Best for complex analysis' },
  { id: 'llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Following instructions' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Long context analysis' },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B', description: 'Fast & lightweight' },
];

export function GroqWizard({ open, onOpenChange }: GroqWizardProps) {
  const { saveConfig, validateKey } = useAIConfig();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('llama-3.3-70b-versatile');
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your Groq API key');
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    const result = await validateKey(apiKey);
    setIsValidating(false);

    if (result.success) {
      setStep(3);
      toast.success('API key validated successfully!');
    } else {
      setValidationError('Invalid API key. Please check and try again.');
      toast.error('API key validation failed');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const result = await saveConfig(apiKey, model);
    setIsSaving(false);

    if (result.success) {
      setStep(4);
      toast.success('Groq AI configured successfully!');
    } else {
      toast.error(result.error || 'Failed to save configuration');
    }
  };

  const handleClose = () => {
    setStep(1);
    setApiKey('');
    setModel('llama-3.3-70b-versatile');
    setValidationError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Brain className="h-6 w-6 text-primary" />
            AI Analysis Engine (Groq)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-between px-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
                </div>
                {s < 4 && (
                  <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: API Key */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <Sparkles className="h-12 w-12 text-primary mx-auto" />
                <h3 className="font-semibold">Enter Your Groq API Key</h3>
                <p className="text-sm text-muted-foreground">
                  Get AI-powered trade sentiment analysis via Telegram
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="gsk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <a 
                href="https://console.groq.com/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Get your API key from Groq Console
              </a>
              <Button 
                className="w-full" 
                onClick={() => apiKey.trim() ? setStep(2) : toast.error('Enter API key')}
              >
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Model Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <h3 className="font-semibold">Select AI Model</h3>
                <p className="text-sm text-muted-foreground">
                  Choose the model for trade analysis
                </p>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROQ_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex flex-col">
                          <span>{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleValidate} disabled={isValidating} className="flex-1">
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
              </div>
              {validationError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {validationError}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <h3 className="font-semibold">API Key Validated!</h3>
                <p className="text-sm text-muted-foreground">
                  Ready to activate AI analysis
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Model:</span>
                  <span>{GROQ_MODELS.find(m => m.id === model)?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commands:</span>
                  <span>/analyze BTC, /analyze ETH</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Activate AI'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="relative mx-auto w-16 h-16">
                  <Brain className="h-16 w-16 text-primary" />
                  <CheckCircle2 className="h-6 w-6 text-green-500 absolute -bottom-1 -right-1" />
                </div>
                <h3 className="font-semibold text-lg">AI Analysis Active!</h3>
                <p className="text-sm text-muted-foreground">
                  Send /analyze BTC in Telegram to get started
                </p>
              </div>
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <p className="text-sm text-center">
                  <span className="font-medium">Tip:</span> Try asking about ETH, SOL, or any crypto symbol
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
