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
  
  // Paper trading mode
  paperTradingMode: boolean;
  
  // Connection status
  connectionStatus: 'connected' | 'disconnected' | 'error';
  
  // Internal flag for initial load
  _hasInitialized: boolean;
  
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
  togglePaperTrading: () => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'error') => void;
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
  paperTradingMode: false,
  connectionStatus: 'connected',
  _hasInitialized: false,
  
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
  
  togglePaperTrading: () => {
    set(state => ({ paperTradingMode: !state.paperTradingMode }));
  },
  
  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },
  
  syncFromDatabase: async () => {
    const { _hasInitialized } = get();
    
    try {
      // Only show loading state on INITIAL load - prevents flickering on updates
      if (!_hasInitialized) {
        set({ isLoading: true });
      }
      set({ connectionStatus: 'connected' });
      
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
        .select('provider, cpu_percent, ram_percent, recorded_at')
        .order('recorded_at', { ascending: false });
      
      // CRITICAL FIX: Fetch VPS→Exchange latency from exchange_pulse (HFT-relevant)
      // NOT from vps_metrics.latency_ms (which is Edge→VPS, irrelevant for HFT)
      const { data: vpsPulseData } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');
      
      // Calculate average VPS→Exchange latency
      const avgExchangeLatency = vpsPulseData?.length 
        ? Math.round(vpsPulseData.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / vpsPulseData.length)
        : 0;
      
      if (vpsData) {
        const statuses: Record<string, VpsStatus> = {};
        vpsData.forEach(v => {
          if (!v.provider) return;
          const metrics = metricsData?.find(m => m.provider === v.provider);
          const isDeployed = v.status === 'running';
          const statusMap: Record<string, 'healthy' | 'warning' | 'error' | 'offline'> = {
            'running': 'healthy',
            'provisioning': 'warning',
            'stopped': 'offline',
            'error': 'error'
          };
          statuses[v.provider] = {
            status: statusMap[v.status || 'error'] || 'error',
            // Use VPS→Exchange latency for deployed VPS
            latencyMs: isDeployed ? avgExchangeLatency : 0,
            cpuPercent: metrics?.cpu_percent || 0,
            memoryPercent: metrics?.ram_percent || 0,
            publicIp: v.outbound_ip,
            region: v.region || 'unknown',
            lastHealthCheck: metrics?.recorded_at ? new Date(metrics.recorded_at) : null
          };
        });
        set({ vpsStatus: statuses });
      }
      
      // Calculate PnL from ACTUAL TRADES in trading_journal (not balance fluctuations)
      // This ensures "Today" shows $0 if no trades have been made
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      // Get today's closed trades PnL
      const { data: todayTrades } = await supabase
        .from('trading_journal')
        .select('pnl')
        .eq('status', 'closed')
        .gte('closed_at', todayStart.toISOString());

      // STRICT RULE: PnL is exactly $0 when no trades exist
      const dailyPnl = todayTrades?.length 
        ? todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) 
        : 0;

      // Get this week's closed trades PnL
      const { data: weekTrades } = await supabase
        .from('trading_journal')
        .select('pnl')
        .eq('status', 'closed')
        .gte('closed_at', weekStart.toISOString());

      const weeklyPnl = weekTrades?.length 
        ? weekTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) 
        : 0;
      
      console.log(`[SSOT] Daily PnL: $${dailyPnl} from ${todayTrades?.length || 0} closed trades`);
      
      set({ dailyPnl, weeklyPnl });
      
      set({ isLoading: false, lastUpdate: Date.now(), _hasInitialized: true });
    } catch (error) {
      console.error('[useAppStore] Sync error:', error);
      set({ isLoading: false, connectionStatus: 'error', _hasInitialized: true });
    }
  }
}));

// Debounce timer for realtime updates
let realtimeDebounceTimer: NodeJS.Timeout | null = null;
const REALTIME_DEBOUNCE_MS = 500;

// Debounced sync to prevent flickering from rapid updates
const debouncedSync = () => {
  if (realtimeDebounceTimer) {
    clearTimeout(realtimeDebounceTimer);
  }
  realtimeDebounceTimer = setTimeout(() => {
    useAppStore.getState().syncFromDatabase();
  }, REALTIME_DEBOUNCE_MS);
};

// Initialize store and set up realtime subscriptions
// IMPORTANT: This does NOT auto-start the bot - it only syncs data from the database
export function initializeAppStore() {
  const store = useAppStore.getState();
  
  // Initial sync - reads current state from DB, does NOT start anything
  store.syncFromDatabase();
  
  // Subscribe to realtime updates with debouncing - single channel for all tables
  // SSOT: All critical tables are synced here for unified state
  const channel = supabase
    .channel('app-store-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_connections' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_pulse' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_instances' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, debouncedSync)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_history' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_journal' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_config' }, debouncedSync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hft_deployments' }, debouncedSync)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[useAppStore] Realtime subscribed');
        store.setConnectionStatus('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[useAppStore] Realtime connection lost');
        store.setConnectionStatus('error');
      }
    });
  
  return () => {
    if (realtimeDebounceTimer) {
      clearTimeout(realtimeDebounceTimer);
    }
    supabase.removeChannel(channel);
  };
}