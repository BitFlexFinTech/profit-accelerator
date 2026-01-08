-- Reset OKX credentials so user can re-enter them with passphrase
UPDATE exchange_connections 
SET 
  api_key = NULL,
  api_secret = NULL, 
  api_passphrase = NULL,
  is_connected = false,
  balance_usdt = 0,
  last_error = NULL,
  last_error_at = NULL,
  last_ping_ms = NULL,
  last_ping_at = NULL,
  balance_updated_at = NULL
WHERE exchange_name = 'OKX';