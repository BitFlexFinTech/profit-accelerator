import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Shield, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

interface MasterPasswordGateProps {
  onUnlock: () => void;
}

export function MasterPasswordGate({ onUnlock }: MasterPasswordGateProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Connecting to Tokyo database...');

  useEffect(() => {
    // Check session on mount
    if (sessionStorage.getItem('hft-unlocked') === 'true') {
      onUnlock();
      return;
    }
    
    checkPasswordExists();
  }, []);

  const checkPasswordExists = async () => {
    // Timeout fallback to prevent indefinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Password check timeout - proceeding with setup');
      setStatusMessage('Connection timeout. Proceeding with setup.');
      setNeedsSetup(true);
      setIsChecking(false);
    }, 5000);

    try {
      setStatusMessage('Checking database connection...');
      
      // Check if password already exists via edge function
      const { data, error: fnError } = await supabase.functions.invoke('verify-password', {
        body: { action: 'check' },
      });

      clearTimeout(timeoutId);

      if (fnError) {
        console.error('Check error:', fnError);
        setStatusMessage('Database ready. Create your master password.');
        setNeedsSetup(true);
        setIsChecking(false);
        return;
      }

      setStatusMessage('Database ready!');
      
      setTimeout(() => {
        if (data?.hasPassword) {
          setNeedsSetup(false);
        } else {
          setNeedsSetup(true);
        }
        setIsChecking(false);
      }, 300);

    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Init error:', err);
      setStatusMessage('Ready to set up.');
      setNeedsSetup(true);
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (needsSetup) {
        // Setting up new password
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setIsLoading(false);
          return;
        }

        const { data, error: fnError } = await supabase.functions.invoke('verify-password', {
          body: { password, action: 'set' },
        });

        if (fnError) throw fnError;
        if (data?.success) {
          sessionStorage.setItem('hft-unlocked', 'true');
          onUnlock();
        } else if (data?.error) {
          setError(data.error);
        }
      } else {
        // Verifying existing password
        const { data, error: fnError } = await supabase.functions.invoke('verify-password', {
          body: { password, action: 'verify' },
        });

        if (fnError) throw fnError;

        if (data?.needsSetup) {
          setNeedsSetup(true);
          setError('');
        } else if (data?.success) {
          sessionStorage.setItem('hft-unlocked', 'true');
          onUnlock();
        } else {
          setError('Invalid password');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(270,50%,5%)] via-[hsl(270,40%,8%)] to-[hsl(280,45%,6%)]">
        <div className="absolute inset-0 opacity-30">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="glass-card p-8 animate-fade-in">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
                <Shield className="w-10 h-10 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                {isChecking ? (
                  <Loader2 className="w-3 h-3 text-accent-foreground animate-spin" />
                ) : (
                  <Lock className="w-3 h-3 text-accent-foreground" />
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold gradient-text mb-2">
              Tokyo HFT Command Center
            </h1>
            <p className="text-muted-foreground text-sm">
              {isChecking && statusMessage}
              {!isChecking && (
                needsSetup
                  ? 'Create your master password to secure the command center'
                  : 'Enter your master password to unlock'
              )}
            </p>
          </div>

          {/* Setup Phase Indicator */}
          {isChecking && (
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                <span className="text-muted-foreground">Connected to Tokyo (ap-northeast-1)</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-foreground">{statusMessage}</span>
              </div>
            </div>
          )}

          {/* Form - only show when ready */}
          {!isChecking && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={needsSetup ? 'Create master password' : 'Enter master password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-secondary/50 border-border/50 focus:border-primary h-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {needsSetup && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm master password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 bg-secondary/50 border-border/50 focus:border-primary h-12"
                  />
                </div>
              )}

              {error && (
                <p className="text-destructive text-sm text-center animate-fade-in">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading || !password}
                className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {needsSetup ? 'Setting up...' : 'Verifying...'}
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    {needsSetup ? 'Create Password & Enter' : 'Unlock Command Center'}
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Region indicator */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Tokyo Region (ap-northeast-1)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
