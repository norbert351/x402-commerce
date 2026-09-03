import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from '../src/ledger.js';

function fresh() { return createLedger(':memory:'); }

test('charge banks a payment with its receipt and counts daily spend', () => {
  const l = fresh();
  const r = l.charge({ txHash: '0xaaa', payer: '0xUSER', resource: '/v1/market/BTCUSDT', amountAtomic: '20000', chainId: 84532, chainName: 'Base', asset: '0xusdc', budgetAtomic: null });
  assert.deepEqual(r, { ok: true });
  const s = l.spendToday('0xuser');
  assert.equal(s.count, 1);
  assert.equal(s.atomic, 20000);
  assert.equal(l.alreadyBanked('0xaaa'), true);
  assert.equal(l.alreadyBanked('0xzzz'), false);
});

test('same tx hash cannot be banked twice (durable replay ring)', () => {
  const l = fresh();
  l.charge({ txHash: '0xbbb', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 84532, chainName: 'Base', asset: '0xusdc', budgetAtomic: null });
  const second = l.charge({ txHash: '0xbbb', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 84532, chainName: 'Base', asset: '0xusdc', budgetAtomic: null });
  assert.deepEqual(second, { ok: false, code: 'already_banked' });
});

test('per-payer daily budget rejects an over-budget charge before it lands', () => {
  const l = fresh();
  const budget = 35000; // atomic
  const ok1 = l.charge({ txHash: '0x1', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  assert.ok(ok1.ok); // 0 -> 20000 ≤ 35000
  // after ok1 daily=20000; a second 20000 would make 40000 > 35000 -> rejected
  const ok2 = l.charge({ txHash: '0x2', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  assert.equal(ok2.ok, false);
  assert.equal(ok2.code, 'budget_exceeded');
  assert.equal(ok2.dailyAtomic, 20000);
  // nothing over budget was banked
  assert.equal(l.alreadyBanked('0x2'), false);
  assert.equal(l.spendToday('0xuser').atomic, 20000);
});

test('a small second charge under remaining budget is allowed', () => {
  const l = fresh();
  const budget = 35000;
  l.charge({ txHash: '0x1', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  const ok2 = l.charge({ txHash: '0x2', payer: '0xUSER', resource: '/r', amountAtomic: '10000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  assert.ok(ok2.ok); // 20000+10000=30000 ≤ 35000
  assert.equal(l.spendToday('0xuser').atomic, 30000);
});

test('budget is per-payer, not global', () => {
  const l = fresh();
  const budget = 35000;
  l.charge({ txHash: '0x1', payer: '0xA', resource: '/r', amountAtomic: '30000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  const other = l.charge({ txHash: '0x2', payer: '0xB', resource: '/r', amountAtomic: '30000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: budget });
  assert.ok(other.ok, 'payer B not affected by payer A spend');
});

test('daily spend resets at UTC midnight', () => {
  const l = fresh();
  // charge at 23:59:59 UTC
  const late = Date.UTC(2026, 8, 8, 23, 59, 59);
  l.charge({ txHash: '0x1', payer: '0xUSER', resource: '/r', amountAtomic: '20000', chainId: 97, chainName: 'BSC', asset: '0xU', budgetAtomic: null, at: late });
  assert.equal(l.spendToday('0xuser', late).count, 1);
  // next day start
  const next = Date.UTC(2026, 8, 9, 0, 0, 1);
  assert.equal(l.spendToday('0xuser', next).count, 0);
});