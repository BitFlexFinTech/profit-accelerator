import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, Copy, ExternalLink, Clock, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface GuideStep {
  title: string;
  description: string;
  location?: string; // Breadcrumb path in provider console
  copyValue?: string; // Value to copy to clipboard
  link?: string; // External link
  image?: string; // Screenshot/image URL
}

interface EmbeddedGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  providerIcon: string;
  title: string;
  estimatedTime: string;
  steps: GuideStep[];
  onComplete: () => void;
}

export function EmbeddedGuide({
  open,
  onOpenChange,
  providerName,
  providerIcon,
  title,
  estimatedTime,
  steps,
  onComplete,
}: EmbeddedGuideProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (value: string, index: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const toggleStepComplete = (index: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedSteps(newCompleted);
  };

  const allStepsCompleted = completedSteps.size === steps.length;

  const handleConfirmComplete = () => {
    onComplete();
    onOpenChange(false);
    setCompletedSteps(new Set());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{providerIcon}</span>
            <div>
              <SheetTitle className="text-left">{title}</SheetTitle>
              <p className="text-sm text-muted-foreground">{providerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              {estimatedTime}
            </Badge>
            <Badge variant="outline" className={cn(
              allStepsCompleted 
                ? "bg-success/10 text-success border-success/30" 
                : "bg-secondary"
            )}>
              {completedSteps.size}/{steps.length} completed
            </Badge>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={index}
              className={cn(
                "p-4 rounded-lg border transition-all",
                completedSteps.has(index)
                  ? "bg-success/5 border-success/30"
                  : "bg-secondary/30 border-border/50"
              )}
            >
              {/* Step Header */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleStepComplete(index)}
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    completedSteps.has(index)
                      ? "bg-success border-success"
                      : "border-muted-foreground/40 hover:border-primary"
                  )}
                >
                  {completedSteps.has(index) && (
                    <Check className="w-3 h-3 text-success-foreground" />
                  )}
                </button>
                <div className="flex-1">
                  <p className={cn(
                    "font-medium",
                    completedSteps.has(index) && "line-through text-muted-foreground"
                  )}>
                    Step {index + 1}: {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Location Breadcrumb */}
              {step.location && (
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Navigate to:</span>
                  {step.location.split(' > ').map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="bg-secondary/50 px-2 py-0.5 rounded">{part}</span>
                      {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
                    </span>
                  ))}
                </div>
              )}

              {/* Copy Value */}
              {step.copyValue && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-muted text-xs font-mono truncate">
                      {step.copyValue}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(step.copyValue!, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* External Link */}
              {step.link && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(step.link, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open in {providerName} Console
                  </Button>
                </div>
              )}

              {/* Image */}
              {step.image && (
                <div className="mt-3">
                  <img
                    src={step.image}
                    alt={`Step ${index + 1} screenshot`}
                    className="rounded border w-full"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <Button
            onClick={handleConfirmComplete}
            className="w-full"
            disabled={!allStepsCompleted}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            I've completed all steps
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Make sure all steps are completed before proceeding
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Pre-built guide configurations for each provider
export const PROVIDER_GUIDES = {
  vultr: {
    providerName: 'Vultr',
    providerIcon: '🦅',
    title: 'Get Vultr API Key',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Log in to Vultr',
        description: 'Go to the Vultr control panel and sign in with your account.',
        link: 'https://my.vultr.com/',
      },
      {
        title: 'Navigate to API Settings',
        description: 'Click on your account name in the top right, then select API.',
        location: 'Account > API',
        link: 'https://my.vultr.com/settings/#settingsapi',
      },
      {
        title: 'Enable API Access',
        description: 'Make sure "Enable API" is checked. If not, enable it.',
      },
      {
        title: 'Copy Your API Key',
        description: 'Copy the Personal Access Token shown. This is your API key.',
      },
      {
        title: 'Allow Your IP (Optional)',
        description: 'For security, you can whitelist specific IP addresses that can use your API key.',
      },
    ],
  },
  aws: {
    providerName: 'AWS',
    providerIcon: '☁️',
    title: 'Get AWS Access Keys',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Log in to AWS Console',
        description: 'Go to the AWS Management Console and sign in.',
        link: 'https://console.aws.amazon.com/',
      },
      {
        title: 'Navigate to IAM',
        description: 'Search for "IAM" in the search bar and click on the IAM service.',
        location: 'Services > IAM',
      },
      {
        title: 'Go to Security Credentials',
        description: 'Click "Users" in the sidebar, then click on your username.',
        location: 'IAM > Users > [Your User]',
      },
      {
        title: 'Create Access Key',
        description: 'Go to the "Security credentials" tab and click "Create access key".',
        location: 'Security credentials > Access keys > Create access key',
      },
      {
        title: 'Copy Keys',
        description: 'Copy both the Access Key ID and Secret Access Key. Store them securely!',
      },
    ],
  },
  digitalocean: {
    providerName: 'DigitalOcean',
    providerIcon: '🌊',
    title: 'Get DigitalOcean API Token',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Log in to DigitalOcean',
        description: 'Go to the DigitalOcean control panel.',
        link: 'https://cloud.digitalocean.com/',
      },
      {
        title: 'Navigate to API',
        description: 'Click on "API" in the left sidebar.',
        location: 'API',
        link: 'https://cloud.digitalocean.com/account/api/tokens',
      },
      {
        title: 'Generate New Token',
        description: 'Click "Generate New Token" and give it a name like "HFT-Bot".',
      },
      {
        title: 'Set Permissions',
        description: 'Select "Read" and "Write" scopes for full access.',
      },
      {
        title: 'Copy Token',
        description: 'Copy the token immediately - it won\'t be shown again!',
      },
    ],
  },
  gcp: {
    providerName: 'Google Cloud',
    providerIcon: '🔵',
    title: 'Get GCP Service Account Key',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Log in to Google Cloud Console',
        description: 'Go to the Google Cloud Console.',
        link: 'https://console.cloud.google.com/',
      },
      {
        title: 'Select or Create Project',
        description: 'Select an existing project or create a new one for HFT trading.',
      },
      {
        title: 'Navigate to Service Accounts',
        description: 'Go to IAM & Admin > Service Accounts.',
        location: 'IAM & Admin > Service Accounts',
      },
      {
        title: 'Create Service Account',
        description: 'Click "Create Service Account" and give it Compute Admin role.',
      },
      {
        title: 'Create and Download Key',
        description: 'Click on the service account, go to Keys, and create a new JSON key.',
      },
    ],
  },
  oracle: {
    providerName: 'Oracle Cloud',
    providerIcon: '🔴',
    title: 'Get Oracle Cloud API Keys',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Log in to Oracle Cloud',
        description: 'Go to the Oracle Cloud Console.',
        link: 'https://cloud.oracle.com/',
      },
      {
        title: 'Go to User Settings',
        description: 'Click your profile icon and select "User Settings".',
        location: 'Profile > User Settings',
      },
      {
        title: 'Navigate to API Keys',
        description: 'Scroll down to "API Keys" section and click "Add API Key".',
        location: 'Resources > API Keys',
      },
      {
        title: 'Generate Key Pair',
        description: 'Select "Generate API Key Pair" and download the private key.',
      },
      {
        title: 'Copy Configuration',
        description: 'Copy the configuration file preview - you\'ll need the fingerprint and tenant ID.',
      },
    ],
  },
  alibaba: {
    providerName: 'Alibaba Cloud',
    providerIcon: '🟠',
    title: 'Get Alibaba Cloud Access Keys',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Log in to Alibaba Cloud',
        description: 'Go to the Alibaba Cloud Console.',
        link: 'https://www.alibabacloud.com/',
      },
      {
        title: 'Go to AccessKey Management',
        description: 'Click your avatar and select "AccessKey Management".',
        location: 'Account > AccessKey Management',
      },
      {
        title: 'Create AccessKey',
        description: 'Click "Create AccessKey" button.',
      },
      {
        title: 'Verify Identity',
        description: 'Complete the security verification process.',
      },
      {
        title: 'Copy Keys',
        description: 'Copy the AccessKey ID and AccessKey Secret. Store securely!',
      },
    ],
  },
  azure: {
    providerName: 'Microsoft Azure',
    providerIcon: '💠',
    title: 'Get Azure Service Principal',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Log in to Azure Portal',
        description: 'Go to the Azure Portal.',
        link: 'https://portal.azure.com/',
      },
      {
        title: 'Navigate to App Registrations',
        description: 'Search for "App registrations" and click on it.',
        location: 'Azure Active Directory > App registrations',
      },
      {
        title: 'New Registration',
        description: 'Click "New registration" and name it "HFT-Bot".',
      },
      {
        title: 'Create Client Secret',
        description: 'Go to "Certificates & secrets" and create a new client secret.',
        location: 'App > Certificates & secrets > New client secret',
      },
      {
        title: 'Copy Credentials',
        description: 'Copy the Application (client) ID, Directory (tenant) ID, and the secret value.',
      },
    ],
  },
  contabo: {
    providerName: 'Contabo',
    providerIcon: '🌏',
    title: 'Setup Contabo VPS',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'Log in to Contabo',
        description: 'Go to the Contabo Customer Control Panel.',
        link: 'https://my.contabo.com/',
      },
      {
        title: 'Go to VPS Control',
        description: 'Navigate to "Your services" > "VPS control".',
        location: 'Your services > VPS control',
      },
      {
        title: 'Find VPS IP Address',
        description: 'Locate your VPS and copy the IP address from the dashboard.',
      },
      {
        title: 'Note SSH Credentials',
        description: 'Ensure you have your SSH root password or have set up SSH keys.',
      },
      {
        title: 'Test SSH Connection',
        description: 'Open a terminal and test: ssh root@YOUR_IP_ADDRESS',
      },
    ],
  },
};
