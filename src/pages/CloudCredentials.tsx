import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, CheckCircle2, XCircle, Clock, Trash2, TestTube2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useCloudCredentials } from '@/hooks/useCloudCredentials';
import { PROVIDER_CONFIGS, Provider } from '@/types/cloudCredentials';
import { cn } from '@/lib/utils';

export default function CloudCredentials() {
  const navigate = useNavigate();
  const {
    credentials,
    isLoading,
    isSaving,
    isValidating,
    saveCredential,
    validateProvider,
    validateAllProviders,
    clearAllCredentials,
    getProviderStatus,
  } = useCloudCredentials();

  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const toggleVisibility = (key: string) => {
    setVisibleFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleValueChange = (provider: Provider, fieldName: string, value: string) => {
    const key = `${provider}-${fieldName}`;
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const handleValueBlur = async (provider: Provider, fieldName: string) => {
    const key = `${provider}-${fieldName}`;
    const value = pendingChanges[key];
    if (value !== undefined) {
      await saveCredential(provider, fieldName, value);
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const getStatusIcon = (status: 'pending' | 'validated' | 'error') => {
    switch (status) {
      case 'validated':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: 'pending' | 'validated' | 'error') => {
    switch (status) {
      case 'validated':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">✅ Validated</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">❌ Error</Badge>;
      default:
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">⏳ Pending</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Cloud Credentials</h1>
              <p className="text-muted-foreground text-sm">
                Enter your cloud provider API keys once. They will be used for automated VPS deployment.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={validateAllProviders}
              disabled={isValidating !== null}
            >
              <TestTube2 className="h-4 w-4 mr-2" />
              Test All Credentials
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all credentials?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all saved cloud provider credentials. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAllCredentials}>
                    Yes, clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Credentials Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>API Credentials</CardTitle>
            <CardDescription>
              All credentials are encrypted before storage. Enter each field and it will auto-save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[140px_1fr_1fr_140px] bg-muted/50 border-b font-medium text-sm">
                <div className="p-3">Provider</div>
                <div className="p-3 border-l">Data Field Name</div>
                <div className="p-3 border-l">Value (Paste Here)</div>
                <div className="p-3 border-l text-center">Status</div>
              </div>

              {/* Table Rows */}
              {PROVIDER_CONFIGS.map((provider, providerIndex) => (
                <div key={provider.name}>
                  {provider.fields.map((field, fieldIndex) => {
                    const cred = credentials.find(
                      c => c.provider === provider.name && c.fieldName === field.fieldName
                    );
                    const key = `${provider.name}-${field.fieldName}`;
                    const isVisible = visibleFields.has(key);
                    const value = pendingChanges[key] ?? cred?.value ?? '';
                    const isFirstField = fieldIndex === 0;
                    const showProviderCell = isFirstField;
                    const providerStatus = getProviderStatus(provider.name);

                    return (
                      <div
                        key={key}
                        className={cn(
                          "grid grid-cols-[140px_1fr_1fr_140px] border-b last:border-b-0",
                          providerIndex % 2 === 0 ? "bg-background" : "bg-muted/20"
                        )}
                      >
                        {/* Provider Cell */}
                        <div className={cn(
                          "p-3 flex items-center",
                          !isFirstField && "border-t-0"
                        )}>
                          {showProviderCell && (
                            <div className="flex flex-col gap-2 w-full">
                              <Badge className={cn(provider.color, provider.textColor, "justify-center")}>
                                {provider.displayName}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => validateProvider(provider.name)}
                                disabled={isValidating === provider.name}
                              >
                                {isValidating === provider.name ? (
                                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <TestTube2 className="h-3 w-3 mr-1" />
                                )}
                                Test
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Field Name Cell */}
                        <div className="p-3 border-l flex items-center">
                          <span className="text-sm">{field.displayName}</span>
                        </div>

                        {/* Value Cell */}
                        <div className="p-3 border-l flex items-center gap-2">
                          {field.isTextarea ? (
                            <Textarea
                              value={value}
                              onChange={(e) => handleValueChange(provider.name, field.fieldName, e.target.value)}
                              onBlur={() => handleValueBlur(provider.name, field.fieldName)}
                              placeholder={`Enter ${field.displayName}...`}
                              className="min-h-[80px] font-mono text-xs"
                            />
                          ) : (
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                type={isVisible ? 'text' : 'password'}
                                value={value}
                                onChange={(e) => handleValueChange(provider.name, field.fieldName, e.target.value)}
                                onBlur={() => handleValueBlur(provider.name, field.fieldName)}
                                placeholder={`Enter ${field.displayName}...`}
                                className="font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                onClick={() => toggleVisibility(key)}
                              >
                                {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Status Cell */}
                        <div className="p-3 border-l flex items-center justify-center">
                          {cred && getStatusBadge(cred.status)}
                        </div>
                      </div>
                    );
                  })}

                  {/* Provider Error Message */}
                  {credentials
                    .filter(c => c.provider === provider.name && c.errorMessage)
                    .slice(0, 1)
                    .map(cred => (
                      <div
                        key={`error-${provider.name}`}
                        className="col-span-4 px-4 py-2 bg-red-500/10 border-b text-red-500 text-sm"
                      >
                        ⚠️ {cred.errorMessage}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Provider Status Summary */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {PROVIDER_CONFIGS.map(provider => {
            const status = getProviderStatus(provider.name);
            return (
              <Card key={provider.name} className={cn(
                "text-center",
                status === 'validated' && "border-green-500/50",
                status === 'error' && "border-red-500/50"
              )}>
                <CardContent className="p-3">
                  <Badge className={cn(provider.color, provider.textColor, "mb-2")}>
                    {provider.displayName}
                  </Badge>
                  <div className="text-xs mt-1">
                    {status === 'not_configured' && <span className="text-muted-foreground">🔴 Not Configured</span>}
                    {status === 'pending' && <span className="text-yellow-500">🟡 Pending</span>}
                    {status === 'validated' && <span className="text-green-500">🟢 Ready</span>}
                    {status === 'error' && <span className="text-red-500">🔴 Error</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={() => navigate('/setup')}>
            ← Back to Setup
          </Button>
          <Button onClick={() => navigate('/vps-setup')}>
            Continue to VPS Setup →
          </Button>
        </div>
      </div>
    </div>
  );
}
