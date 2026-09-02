import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Live Binance market-data source. Public endpoint, no auth — but the ASP serves it ONLY
// behind the x402 gate, so the *paywall* is the product, not the data API.
export async function fetchTicker(symbol = 'BTCUSDT') {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
  const r = await fetch(url); // --dns-result-order=ipv4first set at process start
  if (!r.ok) throw new Error(`binance ${r.status}`);
  return r.json();
}

export async function fetchPrice(symbol = 'BTCUSDT') {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  if (!r.ok) throw new Error(`binance ${r.status}`);
  return r.json();
}

let cached = null;
export function binanceStatus() {
  if (!cached) cached = readFileSync(join(here, '../BINANCE.md'), 'utf8');
  return cached;
}