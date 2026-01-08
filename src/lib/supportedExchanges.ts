export interface SupportedExchange {
  id: string;
  name: string;
  color: string;
  needsPassphrase?: boolean;
  isHyperliquid?: boolean;
}

export const SUPPORTED_EXCHANGES: SupportedExchange[] = [
  { id: 'bybit', name: 'Bybit', color: '#f7a600' },
  { id: 'okx', name: 'OKX', color: '#ffffff', needsPassphrase: true },
  { id: 'bitget', name: 'Bitget', color: '#00d9a5', needsPassphrase: true },
  { id: 'bingx', name: 'BingX', color: '#2b63f6' },
  { id: 'mexc', name: 'MEXC', color: '#00b897' },
  { id: 'gateio', name: 'Gate.io', color: '#17e5a2' },
  { id: 'binance', name: 'Binance', color: '#f3ba2f' },
  { id: 'kucoin', name: 'KuCoin', color: '#23af91', needsPassphrase: true },
  { id: 'kraken', name: 'Kraken', color: '#5741d9' },
  { id: 'nexo', name: 'Nexo', color: '#1a4bff' },
  { id: 'hyperliquid', name: 'Hyperliquid', color: '#00ff88', isHyperliquid: true },
];

// Helper to get exchange by ID or name (case-insensitive)
export function getExchangeById(idOrName: string): SupportedExchange | undefined {
  const lower = idOrName.toLowerCase();
  return SUPPORTED_EXCHANGES.find(
    e => e.id.toLowerCase() === lower || e.name.toLowerCase() === lower
  );
}

// Helper to normalize exchange name to ID
export function normalizeExchangeId(name: string): string {
  const exchange = getExchangeById(name);
  return exchange?.id || name.toLowerCase();
}
