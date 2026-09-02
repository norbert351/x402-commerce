import http from 'node:http';
import { config, buildChallengeBytes, verifyPayments } from '@xpay/core';

// ---- persistent replayed-tx ring (survives restart) ----
import { createConsumeRing } from './ring.js';
const consume = createConsumeRing(new URL('../data', import.meta.url).pathname);

const PORT = Number(process.env.XPAY_PORT || 3000);
const RESOURCE_PREFIX = '/v1/market';

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

// The one paid request. Without a valid PAYMENT-SIGNATURE it returns 402 + challenge;
// with one it verifies the on-chain payment then serves live Binance data.
function handleMarket(req, res) {
  const symbol = (req.url.match(/\/v1\/market\/([A-Za-z0-9-]+)/) || [])[1] || 'BTCUSDT';
  const resource = `${RESOURCE_PREFIX}/${symbol}`;

  const replay = req.headers['payment-signature'];
  if (!replay) {
    const challenge = buildChallengeBytes(resource, `xPay Commerce: ${resource} (live Binance ${symbol.toUpperCase()})`);
    sendJson(res, 402, { error: 'payment required', resource }, {
      'PAYMENT-REQUIRED': challenge,
      'WWW-Authenticate': 'Payment x402Version="2"',
    });
    return;
  }

  // verify payment asynchronously (throws {code, detail})
  verifyPayments(replay, { expectedResource: resource, consume })
    .then(async ({ payer, txHash }) => {
      const data = await currentPrice(symbol);
      sendJson(res, 200, { resource, symbol: symbol.toUpperCase(), price: data.price, payer, paidTx: txHash });
    })
    .catch((err) => {
      sendJson(res, 402, { error: 'payment required', resource, code: err.code, detail: err.detail || '' }, {
        'WWW-Authenticate': 'Payment x402Version="2"',
      });
    });
}

async function currentPrice(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
  const r = await fetch(url); // ipv4 pinned at process start
  return r.json();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true, product: 'xPay Commerce', chainId: config.chainId,
      payTo: config.payTo, amountAtomic: config.amountAtomic, asset: config.asset, ts: Date.now(),
    });
  }
  if (url.pathname.startsWith(RESOURCE_PREFIX)) return handleMarket(req, res);

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[xpay-asp] listening :${PORT}  chainId=${config.chainId} payTo=${config.payTo} price=${config.amountAtomic}(${config.pricePerCallUsd} USDC)`);
});