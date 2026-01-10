/**
 * VPS Bot Control API Service
 * Utility functions to interact with the VPS-hosted Express API
 * Routes all calls through Supabase Edge Functions to avoid CORS issues
 */

import { supabase } from '@/integrations/supabase/client';

export interface VpsHealthResponse {
  ok: boolean;
  uptime?: number;
  responseMs: number;
  error?: string;
  cpu?: number;
  ram?: number;
  disk?: number;
}

export interface ExchangePing {
  exchange: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface VpsPingResponse {
  success: boolean;
  pings: ExchangePing[];
  responseMs: number;
  error?: string;
}

export interface VpsBotStatus {
  running: boolean;
  uptime?: number;
  lastTrade?: string;
  responseMs: number;
  error?: string;
}

/**
 * Check VPS API health status via Edge Function (avoids CORS)
 */
export async function checkVpsApiHealth(ip?: string): Promise<VpsHealthResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'health', ip }
    });

    if (error) {
      return { ok: false, error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { ok: false, error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    return { 
      ok: data.healthy === true, 
      uptime: data.data?.uptime || data.data?.uptime_seconds,
      cpu: data.data?.cpu_percent,
      ram: data.data?.ram_percent || data.data?.memory_percent,
      disk: data.data?.disk_percent,
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error, responseMs: Date.now() - start };
  }
}

/**
 * Ping all exchanges through VPS via Edge Function (avoids CORS)
 */
export async function pingVpsExchanges(ip?: string): Promise<VpsPingResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'ping-exchanges', ip }
    });

    if (error) {
      return { success: false, pings: [], error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { success: false, pings: [], error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    // Transform pings to expected format
    const pings: ExchangePing[] = (data.pings || []).map((p: any) => ({
      exchange: p.exchange || p.exchange_name,
      latencyMs: p.latencyMs || p.latency_ms || 0,
      success: p.success !== false,
      error: p.error
    }));

    return { 
      success: true, 
      pings, 
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, pings: [], error, responseMs: Date.now() - start };
  }
}

/**
 * Get bot status from VPS via Edge Function (avoids CORS)
 */
export async function getVpsBotStatus(ip?: string): Promise<VpsBotStatus> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'bot-status', ip }
    });

    if (error) {
      return { running: false, error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { running: false, error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    return { 
      running: data.running === true || data.data?.running === true, 
      uptime: data.uptime || data.data?.uptime,
      lastTrade: data.lastTrade || data.data?.lastTrade,
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { running: false, error, responseMs: Date.now() - start };
  }
}

/**
 * Test all VPS API endpoints
 */
export async function testAllVpsEndpoints(ip?: string): Promise<{
  health: VpsHealthResponse;
  ping: VpsPingResponse;
  botStatus: VpsBotStatus;
  allOk: boolean;
}> {
  const [health, ping, botStatus] = await Promise.all([
    checkVpsApiHealth(ip),
    pingVpsExchanges(ip),
    getVpsBotStatus(ip),
  ]);
  
  return {
    health,
    ping,
    botStatus,
    allOk: health.ok && ping.success,
  };
}

// ===== NEW VPS DATA ENDPOINTS =====

export interface VpsPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  exchange: string;
}

export interface VpsPositionsResponse {
  success: boolean;
  positions: VpsPosition[];
  responseMs: number;
  error?: string;
}

export interface VpsTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  pnl?: number;
  timestamp: string;
  exchange: string;
}

export interface VpsTradesResponse {
  success: boolean;
  trades: VpsTrade[];
  responseMs: number;
  error?: string;
}

export interface VpsBalance {
  exchange: string;
  total: number;
  available: number;
  currency: string;
}

export interface VpsBalancesResponse {
  success: boolean;
  balances: VpsBalance[];
  totalUsd: number;
  responseMs: number;
  error?: string;
}

export interface VpsBotControlResponse {
  success: boolean;
  message?: string;
  responseMs: number;
  error?: string;
}

/**
 * Get positions from VPS via Edge Function
 */
export async function getVpsPositions(ip?: string): Promise<VpsPositionsResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'positions', ip }
    });

    if (error) {
      return { success: false, positions: [], error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { success: false, positions: [], error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    return { 
      success: true, 
      positions: data.positions || [], 
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, positions: [], error, responseMs: Date.now() - start };
  }
}

/**
 * Get recent trades from VPS via Edge Function
 */
export async function getVpsTrades(ip?: string): Promise<VpsTradesResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'trades', ip }
    });

    if (error) {
      return { success: false, trades: [], error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { success: false, trades: [], error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    return { 
      success: true, 
      trades: data.trades || [], 
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, trades: [], error, responseMs: Date.now() - start };
  }
}

/**
 * Get balances from VPS via Edge Function
 */
export async function getVpsBalances(ip?: string): Promise<VpsBalancesResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'balances', ip }
    });

    if (error) {
      return { success: false, balances: [], totalUsd: 0, error: error.message, responseMs: Date.now() - start };
    }

    if (!data?.success) {
      return { success: false, balances: [], totalUsd: 0, error: data?.error || 'Unknown error', responseMs: Date.now() - start };
    }

    return { 
      success: true, 
      balances: data.balances || [], 
      totalUsd: data.totalUsd || 0,
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, balances: [], totalUsd: 0, error, responseMs: Date.now() - start };
  }
}

/**
 * Start bot via VPS Edge Function
 */
export async function startVpsBot(ip?: string): Promise<VpsBotControlResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'bot-start', ip }
    });

    if (error) {
      return { success: false, error: error.message, responseMs: Date.now() - start };
    }

    return { 
      success: data?.success === true, 
      message: data?.message,
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error, responseMs: Date.now() - start };
  }
}

/**
 * Stop bot via VPS Edge Function
 */
export async function stopVpsBot(ip?: string): Promise<VpsBotControlResponse> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('check-vps-health', {
      body: { action: 'bot-stop', ip }
    });

    if (error) {
      return { success: false, error: error.message, responseMs: Date.now() - start };
    }

    return { 
      success: data?.success === true, 
      message: data?.message,
      responseMs: data.latency_ms || Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error, responseMs: Date.now() - start };
  }
}
