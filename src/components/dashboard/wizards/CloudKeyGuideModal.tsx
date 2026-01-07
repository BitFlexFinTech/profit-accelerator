import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface CloudKeyGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incompleteProviders: string[];
}

const PROVIDER_GUIDES: Record<string, {
  name: string;
  color: string;
  steps: string[];
  url: string;
  tip: string;
}> = {
  aws: {
    name: 'AWS',
    color: 'text-orange-500',
    url: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    steps: [
      'Go to AWS Console → IAM → Users',
      'Click "Create user" and name it "hft-bot"',
      'Attach "AmazonEC2FullAccess" policy',
      'Click "Create access key" → "Application running outside AWS"',
      'Copy Access Key ID and Secret Access Key',
    ],
    tip: 'Use a dedicated IAM user with minimal permissions for security.',
  },
  digitalocean: {
    name: 'DigitalOcean',
    color: 'text-sky-400',
    url: 'https://cloud.digitalocean.com/account/api/tokens',
    steps: [
      'Go to DigitalOcean Dashboard → API → Tokens',
      'Click "Generate New Token"',
      'Name it "hft-bot" and select "Write" scope',
      'Click "Generate Token"',
      'Copy the token immediately (shown only once)',
    ],
    tip: 'Personal Access Tokens have no secret - only the token itself.',
  },
  vultr: {
    name: 'Vultr',
    color: 'text-yellow-400',
    url: 'https://my.vultr.com/settings/#settingsapi',
    steps: [
      'Go to Vultr Dashboard → Account → API',
      'Click "Enable API"',
      'Copy the API Key shown',
      'Add your IP to "Access Control" if required',
    ],
    tip: 'Enable API access before generating the key.',
  },
  contabo: {
    name: 'Contabo',
    color: 'text-pink-500',
    url: 'https://my.contabo.com/api/v1',
    steps: [
      'Go to Contabo Customer Panel → API',
      'Generate OAuth 2.0 credentials',
      'Copy Client ID and Client Secret',
      'Note: Contabo API requires OAuth 2.0 authentication',
    ],
    tip: 'Use OAuth 2.0 Client Credentials flow for server-to-server auth.',
  },
  oracle: {
    name: 'Oracle Cloud',
    color: 'text-red-500',
    url: 'https://cloud.oracle.com/identity/compartments',
    steps: [
      'Go to OCI Console → Identity → Users → Your User',
      'Click "API Keys" → "Add API Key"',
      'Select "Generate API Key Pair"',
      'Download the private key (.pem file)',
      'Copy the Configuration file preview (contains Tenancy OCID)',
    ],
    tip: 'Store the private key securely - paste its contents as the secret.',
  },
  gcp: {
    name: 'Google Cloud',
    color: 'text-green-400',
    url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
    steps: [
      'Go to GCP Console → IAM → Service Accounts',
      'Click "Create Service Account"',
      'Name it "hft-bot" and grant "Compute Admin" role',
      'Click on the new account → "Keys" tab',
      'Add Key → Create new key → JSON format',
      'Download the JSON key file',
    ],
    tip: 'The JSON key file contains all credentials - paste its contents.',
  },
  alibaba: {
    name: 'Alibaba Cloud',
    color: 'text-purple-500',
    url: 'https://ram.console.aliyun.com/users',
    steps: [
      'Go to Alibaba Cloud Console → RAM → Users',
      'Create a new RAM User for programmatic access',
      'Attach "AliyunECSFullAccess" policy',
      'Click "Create AccessKey"',
      'Copy AccessKey ID and AccessKey Secret',
    ],
    tip: 'Use RAM users instead of root account credentials.',
  },
  azure: {
    name: 'Azure',
    color: 'text-teal-500',
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    steps: [
      'Go to Azure Portal → App registrations',
      'Click "New registration" and name it "hft-bot"',
      'After creation, copy Application (client) ID',
      'Go to "Certificates & secrets" → New client secret',
      'Copy the secret value immediately',
      'Note your Subscription ID from the main portal',
    ],
    tip: 'Assign "Contributor" role to the app in your subscription.',
  },
};

export function CloudKeyGuideModal({ open, onOpenChange, incompleteProviders }: CloudKeyGuideModalProps) {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const defaultTab = incompleteProviders[0] || 'aws';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>API Key Generation Guides</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue={defaultTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto p-1">
            {Object.entries(PROVIDER_GUIDES).map(([id, guide]) => (
              <TabsTrigger 
                key={id} 
                value={id}
                className={`text-xs py-1.5 ${incompleteProviders.includes(id) ? 'ring-2 ring-yellow-400' : ''}`}
              >
                <span className={guide.color}>{guide.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {Object.entries(PROVIDER_GUIDES).map(([id, guide]) => (
              <TabsContent key={id} value={id} className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-semibold ${guide.color}`}>{guide.name} Setup</h3>
                  <a
                    href={guide.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open Console <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-3">
                  {guide.steps.map((step, idx) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 group"
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </span>
                      <p className="text-sm flex-1">{step}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleCopy(step, `${id}-${idx}`)}
                      >
                        {copiedStep === `${id}-${idx}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <p className="text-sm">
                    <strong className="text-yellow-400">💡 Pro Tip:</strong> {guide.tip}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-sm">
                    <strong>After getting your keys:</strong> Paste them in the setup table and click "Connect All" to auto-deploy to Tokyo.
                  </p>
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
