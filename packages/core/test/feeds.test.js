import { test } from 'node:test';
import assert from 'node:assert';
import { createFeeds, FEED_TYPES } from '../src/feeds.js';
import { createLedger } from '../src/ledger.js';
import { buildChallengeBytes, decodeReplayBytes } from '../src/x402.js';

test('feed create/validate/dedupe', () => {
  const f = createFeeds(':memory:');
  const feed = f.create({ symbol: 'BTCUSDT', type: 'ticker', priceAtomic: '2000000', budgetAtomic: '5000000', payTo: '0xabc', note: 'my ticker' });
  assert.equal(feed.resource, '/v1/market/BTCUSDT/ticker');
  assert.equal(feed.price_atomic, '2000000');
  assert.throws(() => f.create({ symbol: 'BTCUSDT', type: 'ticker', priceAtomic: '1' }), /already exists/);
  assert.throws(() => f.create({ symbol: '', type: 'spot', priceAtomic: '1' }), /invalid/);
  assert.throws(() => f.create({ symbol: 'BTCUSDT', type: 'bogus', priceAtomic: '1' }), /invalid/);
  assert.throws(() => f.create({ symbol: 'BTCUSDT', type: 'spot', priceAtomic: '0' }), /positive integer/);
  assert.deepEqual(FEED_TYPES.sort(), ['klines', 'spot', 'ticker']);
  f.close();
});

test('byResource returns the matching feed or null', () => {
  const f = createFeeds(':memory:');
  f.create({ symbol: 'ETHUSDT', type: 'spot', priceAtomic: '1000' });
  assert.equal(f.byResource('/v1/market/ETHUSDT')?.symbol, 'ETHUSDT');
  assert.equal(f.byResource('/v1/market/ETHUSDT/ticker'), null);
  assert.equal(f.byResource('/v1/market/BTCUSDT'), null);
  assert.equal(f.byResource('/v1/market/ethusdt'), null); // uppercase enforced
  f.close();
});

test('published feed overrides price+payTo in the challenge; default unchanged when none', () => {
  const f = createFeeds(':memory:');
  const ov = { amountAtomic: '3000000000000000', payTo: '0xABCDEF' };
  const b64 = buildChallengeBytes('/v1/market/SOLUSDT', 'd', ov);
  const chal = JSON.parse(Buffer.from(b64, 'base64').toString());
  assert.equal(chal.accepts[0].amount, '3000000000000000');
  assert.equal(chal.accepts[0].payTo, '0xabcdef');

  // default: no override -> amount is a positive non-empty string and payTo a 0x address
  const d64 = buildChallengeBytes('/v1/market/BTCUSDT', 'd');
  const def = JSON.parse(Buffer.from(d64, 'base64').toString());
  assert.match(def.accepts[0].amount, /^\d+$/);
  assert.match(def.accepts[0].payTo, /^0x[0-9a-f]{40}$/);

  // decodeReplayBytes round-trip still works on a challenge-built signed replay shape
  const accepted = chal.accepts[0];
  const re = Buffer.from(JSON.stringify({ accepted, signature: '0x', payer: '0xAAA' })).toString('base64');
  const dec = decodeReplayBytes(re);
  assert.equal(dec.accepted.amount, '3000000000000000');
  f.close();
});

test('per-feed budget cap enforced at settle (feed.budget via charge budgetAtomic)', () => {
  const ledger = createLedger(':memory:');
  // daily budget 1 unit (1e6); two 0.6-unit charges -> second exceeds
  const budgetAtomic = '1000000';
  const amount = '600000';
  assert.equal(ledger.charge({ txHash: '0x1', payer: '0xB', resource: '/v1/market/BTCUSDT', amountAtomic: amount, chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic }).ok, true);
  const second = ledger.charge({ txHash: '0x2', payer: '0xB', resource: '/v1/market/BTCUSDT', amountAtomic: amount, chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'budget_exceeded');
  ledger.close();
});

test('replay ring: same tx cannot be banked twice (already_banked)', () => {
  const ledger = createLedger(':memory:');
  assert.equal(ledger.charge({ txHash: '0x1', payer: '0xB', resource: '/v1/market/BTCUSDT', amountAtomic: '600000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: undefined }).ok, true);
  assert.equal(ledger.charge({ txHash: '0x1', payer: '0xB', resource: '/v1/market/BTCUSDT', amountAtomic: '600000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: undefined }).code, 'already_banked');
  ledger.close();
});