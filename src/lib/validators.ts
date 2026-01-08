export const validateExchangeAPI = (data: any): Record<string, string> | null => {
  const errors: Record<string, string> = {};

  if (!data.exchange_name) {
    errors.exchange_name = 'Exchange name is required';
  }

  if (!data.api_key || data.api_key.length < 10) {
    errors.api_key = 'API key must be at least 10 characters';
  }

  if (!data.api_secret || data.api_secret.length < 10) {
    errors.api_secret = 'API secret must be at least 10 characters';
  }

  // OKX and KuCoin require passphrase
  if ((data.exchange_name === 'OKX' || data.exchange_name === 'KuCoin') && !data.api_passphrase) {
    errors.api_passphrase = `Passphrase is required for ${data.exchange_name}`;
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateCloudProvider = (data: any): Record<string, string> | null => {
  const errors: Record<string, string> = {};

  if (!data.provider) {
    errors.provider = 'Provider is required';
  }

  if (data.ip_address && !/^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip_address)) {
    errors.ip_address = 'Invalid IP address format';
  }

  // Validate IP octets are 0-255
  if (data.ip_address) {
    const octets = data.ip_address.split('.').map(Number);
    if (octets.some((o: number) => o < 0 || o > 255)) {
      errors.ip_address = 'Invalid IP address - each octet must be 0-255';
    }
  }

  if (!data.region) {
    errors.region = 'Region is required';
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateBotConfig = (data: any): Record<string, string> | null => {
  const errors: Record<string, string> = {};

  if (!data.name) {
    errors.name = 'Configuration name is required';
  }

  if (data.max_position_size !== undefined && data.max_position_size <= 0) {
    errors.max_position_size = 'Position size must be greater than 0';
  }

  if (data.stop_loss_pct !== undefined && (data.stop_loss_pct < 0 || data.stop_loss_pct > 100)) {
    errors.stop_loss_pct = 'Stop loss must be between 0 and 100%';
  }

  if (data.take_profit_pct !== undefined && data.take_profit_pct < 0) {
    errors.take_profit_pct = 'Take profit must be positive';
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

// Cloud provider specific validators
export const validateVultrApiKey = (apiKey: string): string | null => {
  if (!apiKey || apiKey.trim().length < 30) {
    return 'Vultr API key must be at least 30 characters';
  }
  return null;
};

export const validateDigitalOceanToken = (token: string): string | null => {
  if (!token || token.trim().length < 64) {
    return 'DigitalOcean token must be at least 64 characters';
  }
  return null;
};

export const validateAWSCredentials = (accessKeyId: string, secretAccessKey: string): Record<string, string> | null => {
  const errors: Record<string, string> = {};
  
  if (!accessKeyId.match(/^AKIA[A-Z0-9]{16}$/)) {
    errors.accessKeyId = 'Invalid Access Key ID - should start with AKIA and be 20 characters';
  }
  
  if (secretAccessKey.length < 30) {
    errors.secretAccessKey = 'Invalid Secret Access Key - should be at least 40 characters';
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateAzureCredentials = (subscriptionId: string, tenantId: string, clientId: string, clientSecret: string): Record<string, string> | null => {
  const errors: Record<string, string> = {};
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!guidRegex.test(subscriptionId)) {
    errors.subscriptionId = 'Invalid Subscription ID - should be a valid GUID';
  }
  if (!guidRegex.test(tenantId)) {
    errors.tenantId = 'Invalid Tenant ID - should be a valid GUID';
  }
  if (!guidRegex.test(clientId)) {
    errors.clientId = 'Invalid Client ID - should be a valid GUID';
  }
  if (clientSecret.length < 10) {
    errors.clientSecret = 'Invalid Client Secret';
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateOracleCredentials = (tenancyOcid: string, userOcid: string, fingerprint: string, privateKey: string): Record<string, string> | null => {
  const errors: Record<string, string> = {};
  
  if (!tenancyOcid.startsWith('ocid1.tenancy.')) {
    errors.tenancyOcid = 'Invalid Tenancy OCID - should start with ocid1.tenancy.';
  }
  if (!userOcid.startsWith('ocid1.user.')) {
    errors.userOcid = 'Invalid User OCID - should start with ocid1.user.';
  }
  if (!fingerprint.match(/^([a-f0-9]{2}:){15}[a-f0-9]{2}$/i)) {
    errors.fingerprint = 'Invalid fingerprint format';
  }
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    errors.privateKey = 'Invalid private key - should be PEM formatted';
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateAlibabaCredentials = (accessKeyId: string, accessKeySecret: string): Record<string, string> | null => {
  const errors: Record<string, string> = {};
  
  if (!accessKeyId.match(/^LTAI[a-zA-Z0-9]{16,}$/)) {
    errors.accessKeyId = 'Invalid Access Key ID - should start with LTAI';
  }
  if (accessKeySecret.length < 20) {
    errors.accessKeySecret = 'Invalid Access Key Secret - should be at least 20 characters';
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};
