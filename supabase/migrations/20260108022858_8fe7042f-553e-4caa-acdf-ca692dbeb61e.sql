-- Create user_settings table for persistent user preferences
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_currency TEXT DEFAULT 'USDT',
  theme TEXT DEFAULT 'dark',
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  notifications_enabled BOOLEAN DEFAULT true,
  email_alerts BOOLEAN DEFAULT false,
  telegram_alerts BOOLEAN DEFAULT true,
  daily_report_enabled BOOLEAN DEFAULT true,
  weekly_report_enabled BOOLEAN DEFAULT true,
  auto_refresh_interval INTEGER DEFAULT 5,
  sound_alerts BOOLEAN DEFAULT false,
  compact_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy allowing all operations (single-user dashboard)
CREATE POLICY "Allow all operations on user_settings"
  ON public.user_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row
INSERT INTO public.user_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;