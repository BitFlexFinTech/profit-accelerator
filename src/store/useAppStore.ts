import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface ExchangeBalance {
  total: number;
  available: number;
  pnl24h: number;
  isConnected: boolean;
  lastUpdate: Date | null;
}

interface VpsStatus {
  status: 'healthy' | 'warning' | 'error' | 'offline';
  latencyMs: number;
  cpuPercent: number;
  memoryPercent: number;
  publicIp: string | null;
  region: string;
  lastHealthCheck: Date | null;
}

interface ExchangePulse {
  status: 'green' | 'yellow' | 'red';
  latencyMs: number;
  lastPing: Date | null;
}

interface AppState {
  // Exchange Balances (from connected exchanges only)
  exchangeBalances: Record<string, ExchangeBalance>;
  
  // VPS Status (from real cloud providers)
  vpsStatus: Record<string, VpsStatus>;
  
  // Exchange Pulse (11 exchanges)
  exchangePulse: Record<string, ExchangePulse>;
  
  // PnL data
  dailyPnl: number;
  weeklyPnl: number;
  
  // Last global update timestamp
  lastUpdate: number;
  isLoading: boolean;
  
  // COMPUTED SELECTORS (single source of truth calculations)
  getTotalEquity: () => number;
  getTotalPnL24h: () => number;
  getConnectedExchangeCount: () => number;
  getExchangeStatus: (id: string) => 'green' | 'yellow' | 'red';
  getVpsStatusLevel: (provider: string) => 'healthy' | 'warning' | 'error';
  getMeshHealth: () => { healthy: number; total: number };
  getPortfolioBreakdown: () => Array<{
    exchange: string;
    balance: number;
    percentage: number;
    color: string;
  }>;
  
  // ACTIONS (update state from real data sources)
  setExchangeBalance: (exchange: string, balance: ExchangeBalance) => void;
  setVpsStatus: (provider: string, status: VpsStatus) => void;
  setExchangePulse: (exchange: string, pulse: ExchangePulse) => void;
  setPnlData: (daily: number, weekly: number) => void;
  syncFromDatabase: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state - empty, no mock data
  exchangeBalances: {},
  vpsStatus: {},
  exchangePulse: {},
  dailyPnl: 0,
  weeklyPnl: 0,
  lastUpdate: 0,
  isLoading: true,
  
  // COMPUTED SELECTORS
  getTotalEquity: () => {
    const { exchangeBalances } = get();
    return Object.values(exchangeBalances)
      .filter(b => b.isConnected)
      .reduce((sum, b) => sum + b.total, 0);
  },
  
  getTotalPnL24h: () => {
    const { exchangeBalances } = get();
    return Object.values(exchangeBalances)
      .filter(b => b.isConnected)
      .reduce((sum, b) => sum + b.pnl24h, 0);
  },
  
  getConnectedExchangeCount: () => {
    const { exchangeBalances } = get();
    return Object.values(exchangeBalances).filter(b => b.isConnected).length;
  },
  
  getExchangeStatus: (id: string) => {
    const { exchangePulse } = get();
    return exchangePulse[id]?.status || 'red';
  },
  
  getVpsStatusLevel: (provider: string) => {
    const { vpsStatus } = get();
    const status = vpsStatus[provider]?.status;
    if (status === 'offline') return 'error';
    return status || 'error';
  },
  
  getMeshHealth: () => {
    const { vpsStatus } = get();
    const statuses = Object.values(vpsStatus);
    const healthy = statuses.filter(s => s.status === 'healthy').length;
    return { healthy, total: statuses.length };
  },
  
  getPortfolioBreakdown: () => {
    const { exchangeBalances } = get();
    
    const COLORS: Record<string, string> = {
      Binance: '#F0B90B',
      OKX: '#6366F1',
      Bybit: '#F97316',
      Bitget: '#22C55E',
      MEXC: '#3B82F6',
      'Gate.io': '#8B5CF6',
      KuCoin: '#06B6D4',
      Kraken: '#A855F7',
      BingX: '#EC4899',
      Hyperliquid: '#14B8A6',
      Nexo: '#10B981'
    };
    
    const total = Object.values(exchangeBalances)
      .filter(b => b.isConnected && b.total > 0)
      .reduce((sum, b) => sum + b.total, 0);
    
    if (total === 0) return [];
    
    return Object.entries(exchangeBalances)
      .filter(([_, b]) => b.isConnected && b.total > 0)
      .map(([exchange, b]) => ({
        exchange,
        balance: b.total,
        percentage: (b.total / total) * 100,
        color: COLORS[exchange] || '#64748B'
      }))
      .sort((a, b) => b.balance - a.balance);
  },
  
  // ACTIONS
  setExchangeBalance: (exchange, balance) => {
    set(state => ({
      exchangeBalances: { ...state.exchangeBalances, [exchange]: balance },
      lastUpdate: Date.now()
    }));
  },
  
  setVpsStatus: (provider, status) => {
    set(state => ({
      vpsStatus: { ...state.vpsStatus, [provider]: status },
      lastUpdate: Date.now()
    }));
  },
  
  setExchangePulse: (exchange, pulse) => {
    set(state => ({
      exchangePulse: { ...state.exchangePulse, [exchange]: pulse },
      lastUpdate: Date.now()
    }));
  },
  
  setPnlData: (daily, weekly) => {
    set({ dailyPnl: daily, weeklyPnl: weekly, lastUpdate: Date.now() });
  },
  
  syncFromDatabase: async () => {
    try {
      set({ isLoading: true });
      
      // Fetch exchange balances
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, balance_usdt, is_connected, balance_updated_at');
      
      if (exchanges) {
        const balances: Record<string, ExchangeBalance> = {};
        exchanges.forEach(ex => {
          balances[ex.exchange_name] = {
            total: ex.balance_usdt || 0,
            available: ex.balance_usdt || 0,
            pnl24h: 0,
            isConnected: ex.is_connected || false,
            lastUpdate: ex.balance_updated_at ? new Date(ex.balance_updated_at) : null
          };
        });
        set({ exchangeBalances: balances });
      }
      
      // Fetch exchange pulse data
      const { data: pulseData } = await supabase
        .from('exchange_pulse')
        .select('exchange_name, status, latency_ms, last_check');
      
      if (pulseData) {
        const pulses: Record<string, ExchangePulse> = {};
        pulseData.forEach(p => {
          const statusMap: Record<string, 'green' | 'yellow' | 'red'> = {
            'healthy': 'green',
            'jitter': 'yellow',
            'error': 'red'
          };
          pulses[p.exchange_name] = {
            status: statusMap[p.status || 'error'] || 'red',
            latencyMs: p.latency_ms || 0,
            lastPing: p.last_check ? new Date(p.last_check) : null
          };
        });
        set({ exchangePulse: pulses });
      }
      
      // Fetch VPS status
      const { data: vpsData } = await supabase
        .from('vps_config')
        .select('provider, status, outbound_ip, region');
      
      const { data: metricsData } = await supabase
        .from('vps_metrics')
        .select('provider, cpu_percent, ram_percent, latency_ms, recorded_at')
        .order('recorded_at', { ascending: false });
      
      if (vpsData) {
        const statuses: Record<string, VpsStatus> = {};
        vpsData.forEach(v => {
          if (!v.provider) return;
          const metrics = metricsData?.find(m => m.provider === v.provider);
          const statusMap: Record<string, 'healthy' | 'warning' | 'error' | 'offline'> = {
            'running': 'healthy',
            'provisioning': 'warning',
            'stopped': 'offline',
            'error': 'error'
          };
          statuses[v.provider] = {
            status: statusMap[v.status || 'error'] || 'error',
            latencyMs: metrics?.latency_ms || 0,
            cpuPercent: metrics?.cpu_percent || 0,
            memoryPercent: metrics?.ram_percent || 0,
            publicIp: v.outbound_ip,
            region: v.region || 'unknown',
            lastHealthCheck: metrics?.recorded_at ? new Date(metrics.recorded_at) : null
          };
        });
        set({ vpsStatus: statuses });
      }
      
      // Fetch PnL data
      const { data: snapshot } = await supabase
        .from('portfolio_snapshots')
        .select('daily_pnl, weekly_pnl')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (snapshot) {
        set({ dailyPnl: snapshot.daily_pnl || 0, weeklyPnl: snapshot.weekly_pnl || 0 });
      }
      
      set({ isLoading: false, lastUpdate: Date.now() });
    } catch (error) {
      console.error('[useAppStore] Sync error:', error);
      set({ isLoading: false });
    }
  }
}));

// Initialize store and set up realtime subscriptions
export function initializeAppStore() {
  const store = useAppStore.getState();
  store.syncFromDatabase();
  
  // Subscribe to realtime updates
  const channel = supabase
    .channel('app-store-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_connections' }, () => {
      console.log('[useAppStore] exchange_connections changed, syncing...');
      store.syncFromDatabase();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_pulse' }, () => {
      store.syncFromDatabase();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, () => {
      store.syncFromDatabase();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, () => {
      store.syncFromDatabase();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_history' }, () => {
      console.log('[useAppStore] balance_history INSERT, syncing...');
      store.syncFromDatabase();
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}
