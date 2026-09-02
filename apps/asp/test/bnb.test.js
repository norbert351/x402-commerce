import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// BNB Agent OS rail (BSC chatestnet): config reports chain 97 + $U (18 dec), and the
// sell-side gate issues a correctly-shaped x402 challenge WITHOUT a funded wallet.
// (Positive settle->serve on BNB is exercised live only when a BSC-funded key exists.)

const PORT = 3320;
const BASE = `http://localhost:${PORT}`;

async function startServer() {
  const child = spawn('node', ['--dns-result-order=ipv4first', 'src/server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, XPAY_ENV_FILE: '.env.bnb', XPAY_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch {} await sleep(250); }
  return { child };
}

let server;
before(async () => { server = await startServer(); });
after(() => { try { server.child.kill(); } catch {} });

test('BNB rail: health reports chain 97 + $U (United Stables, 18 decimals)', async () => {
  const j = await (await fetch(`${BASE}/health`)).json();
  assert.equal(j.chainId, 97);
  assert.equal(j.payTo, '0x73b16058d57a6337060677496d4a8e97a9554539');
});

test('BNB rail: challenge is $U (18-dec atomic), eip155:97', async () => {
  const r = await fetch(`${BASE}/v1/market/BTCUSDT`);
  assert.equal(r.status, 402);
  const c = JSON.parse(Buffer.from(r.headers.get('payment-required'), 'base64').toString());
  const a = c.accepts[0];
  assert.equal(a.chainId, 97);
  assert.equal(a.network, 'eip155:97');
  assert.equal(a.asset.toLowerCase(), '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565');
  assert.ok(a.extra.includes('United Stables'));
});

test('BNB rail: wrong-amount replay is rejected (reaches BSC RPC)', async () => {
  const bad = Buffer.from(JSON.stringify({ accepted: { amount: '1', chainId: 97, payTo: '0x0000000000000000000000000000000000000000' }, signature: '0xzz', payer: '0x0000000000000000000000000000000000000000' })).toString('base64');
  const r = await fetch(`${BASE}/v1/market/BTCUSDT`, { headers: { 'PAYMENT-SIGNATURE': bad } });
  const j = await r.json();
  assert.equal(r.status, 402);
  assert.equal(j.code, 'amount_mismatch');
});