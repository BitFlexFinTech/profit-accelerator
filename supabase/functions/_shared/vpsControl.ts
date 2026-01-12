/**
 * VPS Control URL Helper
 * 
 * Single source of truth for VPS API endpoints.
 * All edge functions MUST use these helpers to avoid port drift.
 * 
 * Architecture (Option A - Nginx reverse proxy):
 * - VPS runs Node API on localhost:3000
 * - Nginx proxies port 80 -> localhost:3000
 * - All external calls go to port 80 (no port suffix)
 */

// Default timeout for VPS API calls (10 seconds)
export const VPS_API_TIMEOUT_MS = 10000;

// Build base URL for VPS control API (port 80, no suffix)
export function getVpsBaseUrl(ip: string): string {
  return `http://${ip}`;
}

// Endpoint URLs
export function healthUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/health`;
}

export function signalCheckUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/signal-check`;
}

export function statusUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/status`;
}

export function controlUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/control`;
}

export function logsUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/logs`;
}

export function pingExchangesUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/ping-exchanges`;
}

export function botStatusUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/bot/status`;
}

export function positionsUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/positions`;
}

export function tradesUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/trades`;
}

export function balancesUrl(ip: string): string {
  return `${getVpsBaseUrl(ip)}/balances`;
}

// Fetch with timeout helper
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = VPS_API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Structured result for verification endpoints
export interface VpsEndpointResult {
  ok: boolean;
  url: string;
  timeoutMs: number;
  statusCode?: number;
  data?: unknown;
  error?: string;
}

// Check a single endpoint and return structured result
export async function checkEndpoint(
  url: string, 
  timeoutMs: number = VPS_API_TIMEOUT_MS
): Promise<VpsEndpointResult> {
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
    
    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        url,
        timeoutMs,
        statusCode: response.status,
        data,
      };
    } else {
      return {
        ok: false,
        url,
        timeoutMs,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      url,
      timeoutMs,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}
