// Live Binance market-data source (public, no auth). The ASP and MCP tools
// both consume this to serve data BEHIND the x402 gate — the paywall is the
// product, not the data API. `--dns-result-order=ipv4first` must be set at
// process start (this VM's IPv6 egress is broken).
//
// Resilient fetch: api.binance.com is geo-blocked from some datacenter egress
// (e.g. Render). We send a browser-like User-Agent + timeout, and fall back to
// Binance's authenticated-public data host `data-api.binance.vision`, which
// serves the same market data and is broadly reachable.

const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

async function binFetch(path) {
  let lastErr = null;
  for (const base of HOSTS) {
    try {
      const r = await fetch(base + path, {
        signal: AbortSignal.timeout(12000),
        headers: {
          "User-Agent": "xPayCommerce/1.0 (+https://xpay-commerce.onrender.com)",
          Accept: "application/json",
        },
      });
      if (!r.ok) throw new Error(`binance ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("binance unreachable");
}

export async function fetchPrice(symbol = "BTCUSDT") {
  return binFetch(`/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
}

// Richer feed: 24hr ticker (price change, high/low, volume).
export async function fetch24hr(symbol = "BTCUSDT") {
  const d = await binFetch(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
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
export async function fetchKlines(symbol = "BTCUSDT", interval = "1h", limit = 50) {
  const url = `/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${encodeURIComponent(interval)}&limit=${Math.min(Number(limit) || 50, 500)}`;
  const rows = await binFetch(url);
  return rows.map((k) => ({
    openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5],
  }));
}