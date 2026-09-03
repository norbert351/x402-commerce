import http from 'node:http';
import { config, buildChallengeBytes, verifyPayments, createLedger } from '@xpay/core';

// ---- persistent ledger: audit trail + replay ring + per-payer daily spend budget ----
// Replay ring (by txHash) lives inside the gate; the per-payer budget check + audit row
// happen here, where we have BOTH payer and txHash after successful verification.
const ledger = createLedger(new URL('../data/ledger.sqlite', import.meta.url).pathname);
const BUDGET_ATOMIC = process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null;
const CHAIN_NAME = config.chainId === 97 ? 'BSC' : config.chainId === 84532 ? 'Base' : String(config.chainId);

const PORT = Number(process.env.XPAY_PORT || process.env.PORT || 3000); // Render injects PORT
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
// with one it verifies the on-chain payment, banks it against the payer's budget, then
// serves live Binance data.
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

  verifyPayments(replay, { expectedResource: resource, consume: bankTxId })
    .then(async ({ payer, txHash }) => {
      // budget + audit: per-payer, atomic units; reject before serving if over budget
      let charge;
      try {
        charge = ledger.charge({
          txHash, payer, resource, amountAtomic: config.amountAtomic,
          chainId: config.chainId, chainName: CHAIN_NAME, asset: config.asset,
          budgetAtomic: BUDGET_ATOMIC,
        });
      } catch (ce) {
        throw { code: 'db_charge_error', detail: ce.message };
      }
      if (!charge.ok) {
        if (charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${BUDGET_ATOMIC} atomic` };
        if (charge.code === 'already_banked') throw { code: 'payment_already_used', detail: 'tx already consumed' };
      }
      const data = await currentPrice(symbol);
      sendJson(res, 200, { resource, symbol: symbol.toUpperCase(), price: data.price, payer, paidTx: txHash, budget: spendUntil(payer) });
    })
    .catch((err) => {
      sendJson(res, 402, { error: 'payment required', resource, code: err.code, detail: err.detail || '' }, {
        'WWW-Authenticate': 'Payment x402Version="2"',
      });
    });
}

// The gate's replay ring consumes a tx hash once — return true if the tx is NOT yet banked
// (i.e. allowed), throw if already consumed. verify.js: `!consume(tx)` => 'payment_already_used'.
function bankTxId(txHash) {
  if (ledger.alreadyBanked(txHash)) throw { code: 'payment_already_used', detail: 'tx already consumed' };
  return true;
}

function spendUntil(payer) {
  const s = ledger.spendToday(payer);
  return { calls: s.count, atomic: s.atomic };
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
      payTo: config.payTo, amountAtomic: config.amountAtomic, asset: config.asset,
      budgetAtomic: BUDGET_ATOMIC, ts: Date.now(),
    });
  }
  if (url.pathname === '/ledger') {
    return sendJson(res, 200, { payments: ledger.all() });
  }
  if (url.pathname.startsWith(RESOURCE_PREFIX)) return handleMarket(req, res);

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[xpay-asp] listening :${PORT}  chain=${CHAIN_NAME}/${config.chainId} payTo=${config.payTo} price=${config.amountAtomic}(${config.pricePerCallUsd} ${config.chainId===97?'$U':'USDC'}) budgetAtomic=${BUDGET_ATOMIC}`);
});