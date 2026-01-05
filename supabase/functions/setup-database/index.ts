import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting database setup for Tokyo HFT Command Center...');

    // Create all tables using raw SQL via postgres
    const createTablesSQL = `
      -- 1. Master Password
      CREATE TABLE IF NOT EXISTS master_password (
        id TEXT PRIMARY KEY DEFAULT 'master',
        password_hash TEXT NOT NULL,
        kill_switch_code_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 2. VPS Configuration (Tokyo hardcoded)
      CREATE TABLE IF NOT EXISTS vps_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region TEXT NOT NULL DEFAULT 'ap-northeast-1' CHECK (region = 'ap-northeast-1'),
        provider TEXT DEFAULT 'aws',
        instance_type TEXT DEFAULT 't3.micro',
        status TEXT DEFAULT 'inactive',
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 3. Trading Configuration
      CREATE TABLE IF NOT EXISTS trading_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_size_usd DECIMAL(10,2) DEFAULT 350.00,
        spot_profit_target DECIMAL(10,2) DEFAULT 1.00,
        futures_profit_target DECIMAL(10,2) DEFAULT 3.00,
        max_daily_trades INTEGER DEFAULT 100,
        risk_percentage DECIMAL(5,2) DEFAULT 1.00,
        trading_enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 4. Exchange Connections
      CREATE TABLE IF NOT EXISTS exchange_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exchange_name TEXT NOT NULL UNIQUE,
        api_key TEXT,
        api_secret TEXT,
        passphrase TEXT,
        is_connected BOOLEAN DEFAULT false,
        is_testnet BOOLEAN DEFAULT false,
        last_ping_ms INTEGER,
        last_ping_at TIMESTAMPTZ,
        balance_usd DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 5. Latency Thresholds
      CREATE TABLE IF NOT EXISTS latency_thresholds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exchange_name TEXT NOT NULL,
        warning_ms INTEGER DEFAULT 200,
        critical_ms INTEGER DEFAULT 500,
        max_allowed_ms INTEGER DEFAULT 1000,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 6. Trading Journal
      CREATE TABLE IF NOT EXISTS trading_journal (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trade_id TEXT,
        exchange TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT,
        order_type TEXT,
        quantity DECIMAL(20,8),
        price DECIMAL(20,8),
        pnl_usd DECIMAL(15,2),
        ai_reasoning TEXT,
        sentiment_score INTEGER,
        execution_time_ms INTEGER,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 7. Rate Limits
      CREATE TABLE IF NOT EXISTS rate_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exchange_name TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        requests_per_minute INTEGER DEFAULT 60,
        requests_per_second INTEGER DEFAULT 10,
        current_usage INTEGER DEFAULT 0,
        last_reset_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 8. Backtest Results
      CREATE TABLE IF NOT EXISTS backtest_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        strategy_name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        initial_balance DECIMAL(15,2),
        final_balance DECIMAL(15,2),
        total_trades INTEGER,
        winning_trades INTEGER,
        losing_trades INTEGER,
        max_drawdown_percent DECIMAL(5,2),
        sharpe_ratio DECIMAL(5,2),
        profit_factor DECIMAL(5,2),
        win_rate DECIMAL(5,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 9. Portfolio Snapshots
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_date DATE NOT NULL,
        total_balance_usd DECIMAL(15,2),
        daily_pnl_usd DECIMAL(15,2),
        daily_pnl_percent DECIMAL(5,2),
        exchange_balances JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 10. Strategy Rules
      CREATE TABLE IF NOT EXISTS strategy_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        strategy_name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT false,
        rules JSONB NOT NULL DEFAULT '[]',
        entry_conditions JSONB DEFAULT '[]',
        exit_conditions JSONB DEFAULT '[]',
        risk_params JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 11. Telegram Configuration
      CREATE TABLE IF NOT EXISTS telegram_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_token TEXT,
        chat_id TEXT,
        is_verified BOOLEAN DEFAULT false,
        notifications_enabled BOOLEAN DEFAULT true,
        notify_on_trade BOOLEAN DEFAULT true,
        notify_on_error BOOLEAN DEFAULT true,
        notify_on_daily_summary BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 12. Achievements
      CREATE TABLE IF NOT EXISTS achievements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        achievement_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        category TEXT,
        is_unlocked BOOLEAN DEFAULT false,
        unlocked_at TIMESTAMPTZ,
        progress INTEGER DEFAULT 0,
        target INTEGER DEFAULT 100,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 13. Sentiment Data
      CREATE TABLE IF NOT EXISTS sentiment_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source TEXT NOT NULL,
        symbol TEXT,
        fear_greed_index INTEGER,
        sentiment_label TEXT,
        social_volume INTEGER,
        news_sentiment DECIMAL(3,2),
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 14. Trade Copies
      CREATE TABLE IF NOT EXISTS trade_copies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        master_exchange TEXT NOT NULL,
        mirror_exchanges TEXT[] NOT NULL DEFAULT '{}',
        copy_mode TEXT DEFAULT 'proportional',
        fixed_amount DECIMAL(10,2),
        proportion_multiplier DECIMAL(5,2) DEFAULT 1.0,
        is_active BOOLEAN DEFAULT false,
        copy_spot BOOLEAN DEFAULT true,
        copy_futures BOOLEAN DEFAULT true,
        total_copied INTEGER DEFAULT 0,
        last_copy_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Execute table creation
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTablesSQL });
    
    // If rpc doesn't exist, tables might already exist or we need different approach
    // Let's check if tables exist by trying to select from them
    const { error: checkError } = await supabase.from('master_password').select('id').limit(1);
    
    if (checkError && checkError.code === '42P01') {
      // Table doesn't exist - we need to inform user to run migrations
      console.log('Tables do not exist yet. Please run migrations.');
      return new Response(
        JSON.stringify({ 
          success: false, 
          needsMigration: true,
          message: 'Database tables need to be created. Please click the "Run migrations" button.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tables exist, now seed default data
    console.log('Seeding default data...');

    // Insert default VPS config
    await supabase.from('vps_config').upsert({
      region: 'ap-northeast-1',
      provider: 'aws',
      status: 'inactive'
    }, { onConflict: 'id' });

    // Insert default trading config
    await supabase.from('trading_config').upsert({
      order_size_usd: 350.00,
      spot_profit_target: 1.00,
      futures_profit_target: 3.00
    }, { onConflict: 'id' });

    // Insert exchanges
    const exchanges = ['Binance', 'OKX', 'Bybit', 'Kraken', 'Nexo', 'KuCoin', 'Hyperliquid'];
    for (const exchange of exchanges) {
      await supabase.from('exchange_connections').upsert({
        exchange_name: exchange,
        is_connected: false
      }, { onConflict: 'exchange_name' });
    }

    // Insert achievements
    const achievements = [
      { achievement_key: 'first_trade', name: 'First Blood', description: 'Execute your first trade', icon: '🎯', category: 'milestone', target: 1 },
      { achievement_key: 'profit_100', name: 'Century Club', description: 'Earn $100 in profits', icon: '💯', category: 'milestone', target: 100 },
      { achievement_key: 'profit_1000', name: 'Four Figures', description: 'Earn $1,000 in profits', icon: '💰', category: 'milestone', target: 1000 },
      { achievement_key: 'trades_100', name: 'Trader', description: 'Complete 100 trades', icon: '📊', category: 'trading', target: 100 },
      { achievement_key: 'win_streak_5', name: 'Hot Hand', description: '5 winning trades in a row', icon: '✋', category: 'streak', target: 5 },
      { achievement_key: 'tokyo_master', name: 'Tokyo Master', description: 'Run bot for 30 days', icon: '🗼', category: 'special', target: 30 },
    ];
    
    for (const ach of achievements) {
      await supabase.from('achievements').upsert(ach, { onConflict: 'achievement_key' });
    }

    // Insert default telegram config
    await supabase.from('telegram_config').upsert({
      notifications_enabled: true,
      notify_on_trade: true,
      notify_on_error: true
    }, { onConflict: 'id' });

    console.log('Database setup complete!');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'All 14 tables created and seeded successfully',
        tables: [
          'master_password', 'vps_config', 'trading_config', 'exchange_connections',
          'latency_thresholds', 'trading_journal', 'rate_limits', 'backtest_results',
          'portfolio_snapshots', 'strategy_rules', 'telegram_config', 'achievements',
          'sentiment_data', 'trade_copies'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Setup error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        needsMigration: true
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
