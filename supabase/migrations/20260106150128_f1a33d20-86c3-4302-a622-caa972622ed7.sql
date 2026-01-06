-- Add whitelisted_range column to credential_permissions
ALTER TABLE credential_permissions 
ADD COLUMN IF NOT EXISTS whitelisted_range text;

-- Insert IP whitelist records for Binance and OKX
INSERT INTO credential_permissions (provider, credential_type, ip_restricted, whitelisted_range, security_score)
VALUES 
  ('Binance', 'exchange', true, '13.39.87.0/24', 95),
  ('OKX', 'exchange', true, '13.39.87.0/24', 95);

-- Ensure VPS has correct Tokyo IP
UPDATE vps_config 
SET 
  outbound_ip = '167.179.83.239',
  status = 'idle',
  updated_at = now()
WHERE provider = 'vultr';