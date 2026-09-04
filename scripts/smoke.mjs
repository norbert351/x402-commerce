#!/usr/bin/env node
// xPay Commerce — post-deploy smoke check. Verifies the deployed ASP is healthy:
// health, free preview serves live Binance data, the paywall 402s unpaid requests,
// and the HTTP/SSE MCP endpoint answers. Exit non-zero on any failure.
//
// Usage: node scripts/smoke.mjs [https://xpay-commerce.onrender.com]
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] ||
  (process.env.XPAY_PUBLIC_URL) ||
  'http://localhost:3000').replace(/\/$/, '');

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function get(path) {
  const r = await fetch(BASE + path, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'xpay-smoke/0.1' },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

console.log(`\nxPay Commerce smoke check  →  ${BASE}\n`);

try {
  // 1. health
  const h = await get('/health');
  check('health 200', h.status === 200, `product=${h.body.product} chain=${h.body.chainId} payTo=${h.body.payTo?.slice(0, 10)}…`);

  // 2. free live preview (real Binance data, no payment)
  const pv = await get('/v1/preview/BTCUSDT');
  check('free preview 200', pv.status === 200);
  check('preview has live price', !!pv.body.price && pv.body.price !== '0', `BTC ${pv.body.price}`);

  // 3. paywall: unpaid /v1/market 402s with a PAYMENT-REQUIRED challenge
  const raw = await fetch(BASE + '/v1/market/BTCUSDT', { signal: AbortSignal.timeout(20000) });
  const paywallOk = raw.status === 402;
  const hasChallenge = !!raw.headers.get('payment-required');
  check('paywall 402 (unpaid)', paywallOk && hasChallenge, `HTTP ${raw.status}`);

  // 4. richer paid rail also 402s
  const tk = await fetch(BASE + '/v1/market/BTCUSDT/ticker', { signal: AbortSignal.timeout(20000) });
  check('ticker paywall 402', tk.status === 402, `HTTP ${tk.status}`);
  const kl = await fetch(BASE + '/v1/market/BTCUSDT/klines?interval=1h&limit=5', { signal: AbortSignal.timeout(20000) });
  check('klines paywall 402', kl.status === 402, `HTTP ${kl.status}`);

  // 5. ledger + budget (public)
  const lg = await get('/ledger');
  check('ledger 200', lg.status === 200, `${lg.body.payments?.length ?? 0} payments`);
  const bg = await get('/budget');
  check('budget 200', bg.status === 200);

  // 6. HTTP/SSE MCP handshake — read only the leading bytes (SSE stays open)
  const mcp = await fetch(BASE + '/mcp', { signal: AbortSignal.timeout(5000) });
  const mcpType = mcp.headers.get('content-type') || '';
  const reader = mcp.body.getReader();
  const { value } = await reader.read();
  const head = value ? new TextDecoder().decode(value) : '';
  const isSse = mcp.status === 200 && mcpType.includes('text/event-stream') && head.includes('endpoint');
  check('MCP /mcp 200 + SSE', isSse, mcpType);
  await reader.cancel().catch(() => {});

  // 7. UI shell serves
  const ui = await fetch(BASE + '/', { signal: AbortSignal.timeout(15000) });
  const uiHtml = await ui.text();
  check('UI / serves HTML', ui.status === 200 && /<html/i.test(uiHtml));

} catch (err) {
  fail++;
  console.error(`  ✗ smoke check crashed: ${err.message}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// helper to keep argv/resource cost down
void readFileSync; void join;