/**
 * VPS Bot Control API Service
 * Utility functions to interact with the VPS-hosted Express API
 */

export interface VpsHealthResponse {
  ok: boolean;
  uptime?: number;
  responseMs: number;
  error?: string;
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
 * Check VPS API health status
 */
export async function checkVpsApiHealth(ip: string): Promise<VpsHealthResponse> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`http://${ip}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, responseMs: Date.now() - start };
    }
    
    const data = await res.json();
    return { 
      ok: data.ok === true, 
      uptime: data.uptime, 
      responseMs: Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error, responseMs: Date.now() - start };
  }
}

/**
 * Ping all exchanges through VPS
 */
export async function pingVpsExchanges(ip: string): Promise<VpsPingResponse> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(`http://${ip}/ping-exchanges`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      return { success: false, pings: [], error: `HTTP ${res.status}`, responseMs: Date.now() - start };
    }
    
    const data = await res.json();
    return { 
      success: true, 
      pings: data.results || [], 
      responseMs: Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, pings: [], error, responseMs: Date.now() - start };
  }
}

/**
 * Get bot status from VPS
 */
export async function getVpsBotStatus(ip: string): Promise<VpsBotStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`http://${ip}/bot/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      return { running: false, error: `HTTP ${res.status}`, responseMs: Date.now() - start };
    }
    
    const data = await res.json();
    return { 
      running: data.running === true, 
      uptime: data.uptime,
      lastTrade: data.lastTrade,
      responseMs: Date.now() - start 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { running: false, error, responseMs: Date.now() - start };
  }
}

/**
 * Test all VPS API endpoints
 */
export async function testAllVpsEndpoints(ip: string): Promise<{
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
