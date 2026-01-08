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

  if (data.exchange_name === 'OKX' && !data.api_passphrase) {
    errors.api_passphrase = 'Passphrase is required for OKX';
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
