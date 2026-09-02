import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.XPAY_TEST_PORT || 3900);
const BASE = `http://localhost:${PORT}`;

async function startServer() {
  const child = spawn('node', ['--dns-result-order=ipv4first', 'src/server.js'], {
    cwd: new URL('..', import.meta.url).pathname.slice(0, -1),
    env: { ...process.env, XPAY_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  // wait for listen
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch {}
    await sleep(250);
  }
  return { child, out: () => out };
}

let server;
before(async () => { server = await startServer(); });
after(() => { try { server.child.kill(); } catch {} });

test('/health is public and reports the product', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.product, 'xPay Commerce');
  assert.ok(j.payTo);
  assert.ok(j.amountAtomic);
});

test('paid endpoint returns 402 + valid challenge when no PAYMENT-SIGNATURE', async () => {
  const r = await fetch(`${BASE}/v1/market/BTCUSDT`);
  assert.equal(r.status, 402);
  const challengeB64 = r.headers.get('payment-required');
  assert.ok(challengeB64, 'PAYMENT-REQUIRED header present');
  const c = JSON.parse(Buffer.from(challengeB64, 'base64').toString());
  assert.equal(c.x402Version, 2);
  assert.equal(c.resource, '/v1/market/BTCUSDT');
});

test('malformed / unsigned replay is rejected, not served', async () => {
  const bad = Buffer.from(JSON.stringify({ accepted: { amount: '1', chainId: 1, payTo: '0x0' }, signature: '0xzz', payer: '0x0' })).toString('base64');
  const r = await fetch(`${BASE}/v1/market/BTCUSDT`, { headers: { 'PAYMENT-SIGNATURE': bad } });
  // no valid on-chain proof exists for this garbage -> server must NOT return 200
  assert.notEqual(r.status, 200);
  assert.equal(r.status, 402);
});