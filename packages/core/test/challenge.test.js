import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChallengeBytes, buildReplayBytes, acceptedEntry } from '@xpay/core';

// Field-match + envelope unit tests (no network required for the mismatch paths)
test('challenge envelope is valid base64 JSON with x402Version 2', () => {
  const b64 = buildChallengeBytes('/v1/market/BTCUSDT', 'desc');
  const c = JSON.parse(Buffer.from(b64, 'base64').toString());
  assert.equal(c.x402Version, 2);
  assert.equal(c.accepts.length, 1);
  assert.equal(c.accepts[0].scheme, 'exact');
  assert.equal(c.accepts[0].chainId, Number(process.env.XPAY_CHAIN_ID || 84532));
});

test('replay envelope round-trips accepted/signature/payer', () => {
  const accepted = acceptedEntry('/r', 'd');
  accepted.extra = '{"name":"USDC","version":"2"}';
  const b64 = buildReplayBytes({ accepted, signature: '0xsig', payer: '0xpayer' });
  const d = JSON.parse(Buffer.from(b64, 'base64').toString());
  assert.equal(d.payer, '0xpayer');
  assert.equal(d.signature, '0xsig');
});

test('amount atomic is derived from price (not a guess)', () => {
  const price = Number(process.env.XPAY_PRICE_USDC || 0.02);
  const dec = Number(process.env.XPAY_DECIMALS || 6);
  const accepted = acceptedEntry('/r', 'd');
  assert.equal(accepted.amount, String(Math.round(price * 10 ** dec)));
});