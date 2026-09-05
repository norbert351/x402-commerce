import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, buildChallengeBytes, verifyPayments, createLedger } from '@xpay/core';
import { fetchPrice, fetch24hr, fetchKlines } from '@xpay/core/binance.js';
import { handleMcpRequest } from '@xpay/mcp/http-server.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---- persistent ledger: audit trail + replay ring + per-payer daily spend budget ----
const ledger = createLedger(new URL('../data/ledger.sqlite', import.meta.url).pathname);
const BUDGET_ATOMIC = process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null;
const CHAIN_NAME = config.chainId === 97 ? 'BSC' : config.chainId === 84532 ? 'Base' : String(config.chainId);

const PORT = Number(process.env.XPAY_PORT || process.env.PORT || 3000); // Render injects PORT

// ---- static UI (dashboard) ----
const PUBLIC_DIR = join(here, '../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json' };
function servePublic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // prevent path traversal
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const body = readFileSync(file);
    const ext = (file.match(/\.[a-z0-9]+$/i) || ['.html'])[0];
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, PAYMENT-SIGNATURE',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(body);
}

// ---- resource routing: each paid datum is its own resource, same gate ----
// /v1/market/:sym            -> spot price (the base paid surface)
// /v1/market/:sym/ticker     -> 24hr ticker (change/high/low/volume) — richer
// /v1/market/:sym/klines     -> candlesticks (interval/limit query)
// /v1/preview/:sym           -> FREE live price preview (public teaser, no payment)
const PAID_PREFIX = '/v1/market';

async function servePaid(req, res, resource, symbol) {
  const replay = req.headers['payment-signature'];
  if (!replay) {
    const challenge = buildChallengeBytes(resource, `xPay Commerce: ${resource} (live Binance ${symbol.toUpperCase()})`);
    return sendJson(res, 402, { error: 'payment required', resource, hint: 'settle on-chain then replay with PAYMENT-SIGNATURE' }, {
      'PAYMENT-REQUIRED': challenge,
      'WWW-Authenticate': 'Payment x402Version="2"',
    });
  }
  verifyPayments(replay, { expectedResource: resource, consume: bankTxId })
    .then(async ({ payer, txHash }) => {
      let charge;
      try {
        charge = ledger.charge({ txHash, payer, resource, amountAtomic: config.amountAtomic, chainId: config.chainId, chainName: CHAIN_NAME, asset: config.asset, budgetAtomic: BUDGET_ATOMIC });
      } catch (ce) { throw { code: 'db_charge_error', detail: ce.message }; }
      if (!charge.ok) {
        if (charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${BUDGET_ATOMIC} atomic` };
        if (charge.code === 'already_banked') throw { code: 'payment_already_used', detail: 'tx already consumed' };
      }
      const data = await datumFor(resource, symbol);
      sendJson(res, 200, { resource, symbol: symbol.toUpperCase(), ...data, payer, paidTx: txHash, budget: spendUntil(payer) });
    })
    .catch((err) => {
      sendJson(res, 402, { error: 'payment required', resource, code: err.code, detail: err.detail || '' }, { 'WWW-Authenticate': 'Payment x402Version="2"' });
    });
}

async function datumFor(resource, symbol) {
  if (resource.endsWith('/ticker')) return { ticker: await fetch24hr(symbol) };
  if (resource.includes('/klines')) return { klines: await fetchKlines(symbol, '', '') }; // interval/limit baked in resource
  const p = await fetchPrice(symbol);
  return { price: p.price };
}

// The gate's replay ring consumes a tx hash once — return true if the tx is NOT yet banked.
function bankTxId(txHash) {
  if (ledger.alreadyBanked(txHash)) throw { code: 'payment_already_used', detail: 'tx already consumed' };
  return true;
}

function spendUntil(payer) {
  const s = ledger.spendToday(payer);
  return { calls: s.count, atomic: s.atomic };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  // HTTP/SSE MCP — remote agents reach the paid tools over SSE on this port.
  if (url.pathname === '/mcp') return handleMcpRequest(req, res, url);

  // health
  if (url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true, product: 'xPay Commerce', chainId: config.chainId, network: config.network,
      payTo: config.payTo, amountAtomic: config.amountAtomic, priceUsdc: config.pricePerCallUsd,
      asset: config.asset, decimals: config.decimals, budgetAtomic: BUDGET_ATOMIC,
      ledger: { payments: ledger.all().length }, ts: Date.now(),
    });
  }
  // public ledger
  if (url.pathname === '/ledger') return sendJson(res, 200, { payments: ledger.all() });
  // budget insight (public)
  if (url.pathname === '/budget') {
    const byPayer = {};
    for (const p of ledger.all()) {
      byPayer[p.payer] = byPayer[p.payer] || { calls: 0, atomic: 0 };
      byPayer[p.payer].calls += 1;
      byPayer[p.payer].atomic += Number(p.amount_atomic) || 0;
    }
    return sendJson(res, 200, { budgetAtomic: BUDGET_ATOMIC, byPayer });
  }

  // FREE live preview (teaser for the dashboard; no payment)
  const preview = url.pathname.match(/^\/v1\/preview\/([A-Za-z0-9-]+)$/);
  if (preview) {
    const symbol = preview[1];
    Promise.all([fetchPrice(symbol).catch(() => null), fetch24hr(symbol).catch(() => null)])
      .then(([price, ticker]) => sendJson(res, 200, { resource: `/v1/preview/${symbol.toUpperCase()}`, symbol: symbol.toUpperCase(), free: true, price: price?.price ?? null, ticker, hint: 'Free 2s-fresh preview. Unlock full /v1/market (ticker, klines) with a micro x402 payment.' }))
      .catch((e) => sendJson(res, 502, { error: 'binance_unreachable', detail: e.message }));
    return;
  }

  // RICH PAID feed: /v1/market/:sym, /v1/market/:sym/ticker, /v1/market/:sym/klines[?interval&limit]
  const paid = url.pathname.match(/^\/v1\/market\/([A-Za-z0-9-]+)$/);
  if (paid) return servePaid(req, res, `/v1/market/${paid[1]}`, paid[1]);
  const tickerPaid = url.pathname.match(/^\/v1\/market\/([A-Za-z0-9-]+)\/ticker$/);
  if (tickerPaid) return servePaid(req, res, `/v1/market/${tickerPaid[1]}/ticker`, tickerPaid[1]);
  const klinesPaid = url.pathname.match(/^\/v1\/market\/([A-Za-z0-9-]+)\/klines$/);
  if (klinesPaid) {
    // build a unique resource so replay rings per (symbol, interval, limit)
    const sym = klinesPaid[1];
    const interval = url.searchParams.get('interval') || '1h';
    const limit = url.searchParams.get('limit') || '50';
    const resource = `/v1/market/${sym}/klines?interval=${interval}&limit=${limit}`;
    // patch: klines expects interval/limit from resource; re-derive here
    return servePaidKlines(req, res, resource, sym, interval, limit);
  }

  // static UI
  if (url.pathname === '/' || url.pathname.startsWith('/public') || (!url.pathname.startsWith('/v1') && !url.pathname.startsWith('/health') && !url.pathname.startsWith('/ledger') && !url.pathname.startsWith('/budget'))) {
    return servePublic(req, res, url.pathname);
  }

  sendJson(res, 404, { error: 'not found' });
});

async function servePaidKlines(req, res, resource, symbol, interval, limit) {
  const replay = req.headers['payment-signature'];
  if (!replay) {
    const challenge = buildChallengeBytes(resource, `xPay Commerce: ${resource} (live Binance ${symbol.toUpperCase()})`);
    return sendJson(res, 402, { error: 'payment required', resource, hint: 'settle on-chain then replay with PAYMENT-SIGNATURE' }, {
      'PAYMENT-REQUIRED': challenge,
      'WWW-Authenticate': 'Payment x402Version="2"',
    });
  }
  verifyPayments(replay, { expectedResource: resource, consume: bankTxId })
    .then(async ({ payer, txHash }) => {
      let charge;
      try {
        charge = ledger.charge({ txHash, payer, resource, amountAtomic: config.amountAtomic, chainId: config.chainId, chainName: CHAIN_NAME, asset: config.asset, budgetAtomic: BUDGET_ATOMIC });
      } catch (ce) { throw { code: 'db_charge_error', detail: ce.message }; }
      if (!charge.ok) {
        if (charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${BUDGET_ATOMIC} atomic` };
        if (charge.code === 'already_banked') throw { code: 'payment_already_used', detail: 'tx already consumed' };
      }
      const klines = await fetchKlines(symbol, interval, limit);
      sendJson(res, 200, { resource, symbol: symbol.toUpperCase(), klines, interval, payer, paidTx: txHash, budget: spendUntil(payer) });
    })
    .catch((err) => {
      sendJson(res, 402, { error: 'payment required', resource, code: err.code, detail: err.detail || '' }, { 'WWW-Authenticate': 'Payment x402Version="2"' });
    });
}

server.listen(PORT, () => {
  console.log(`[xpay-asp] listening :${PORT}  chain=${CHAIN_NAME}/${config.chainId} payTo=${config.payTo} price=${config.amountAtomic}(${config.pricePerCallUsd} ${config.chainId === 97 ? '$U' : 'USDC'}) budgetAtomic=${BUDGET_ATOMIC}`);
});