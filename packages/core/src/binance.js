// Live Binance market-data source (public, no auth). The ASP and MCP tools
// both consume this to serve data BEHIND the x402 gate — the paywall is the
// product, not the data API. `--dns-result-order=ipv4first` must be set at
// process start (this VM's IPv6 egress is broken).
export async function fetchPrice(symbol = 'BTCUSDT') {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  if (!r.ok) throw new Error(`binance ${r.status}`);
  return r.json();
}

// Richer feed: 24hr ticker (price change, high/low, volume).
export async function fetch24hr(symbol = 'BTCUSDT') {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  if (!r.ok) throw new Error(`binance ${r.status}`);
  const d = await r.json();
  return {
    symbol: d.symbol,
    lastPrice: d.lastPrice,
    priceChange: d.priceChange,
    priceChangePercent: d.priceChangePercent,
    highPrice: d.highPrice,
    lowPrice: d.lowPrice,
    volume: d.volume,
    quoteVolume: d.quoteVolume,
    openPrice: d.openPrice,
    ts: d.closeTime,
  };
}

// Klines (candlesticks). interval default 1h.
export async function fetchKlines(symbol = 'BTCUSDT', interval = '1h', limit = 50) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${encodeURIComponent(interval)}&limit=${Math.min(Number(limit) || 50, 500)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`binance ${r.status}`);
  const rows = await r.json();
  return rows.map((k) => ({
    openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5],
  }));
}