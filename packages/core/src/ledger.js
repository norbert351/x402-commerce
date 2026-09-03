import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Ledger + spend-budget enforcement.
//   - Every settled payment is rowed with its on-chain receipt (tx hash = PK, so the
//     table doubles as a durable replay ring: one transfer = one request, across restarts).
//   - A per-payer daily spend budget is enforced at settle time: budget is expressed in
//     ATOMIC units of the settle asset (the honest unit; no price-oracle pretence).
//     A payer at/over budget gets `budget_exceeded` and the resource is NOT served.
// node:sqlite — zero deps, deterministic, survives restart.
export function createLedger(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      tx_hash TEXT PRIMARY KEY,
      payer TEXT NOT NULL,
      resource TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      chain_name TEXT NOT NULL,
      asset TEXT NOT NULL,
      settled_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payer ON payments(payer);
  `);
  return {
    // Record a settlement AND check the payer's daily atomic budget in one call.
    // budgetAtomic: null = no cap. Returns {ok:true} or {ok:false, code:'budget_exceeded', dailyAtomic, budgetAtomic}.
    charge({ txHash, payer, resource, amountAtomic, chainId, chainName, asset, budgetAtomic, at }) {
      const now = at || Date.now();
      const dayStart = dayStartUtc(now);
      const amt = Number(amountAtomic) || 0;
      const rows = db.prepare('SELECT amount_atomic FROM payments WHERE payer = ? AND settled_at >= ?').all(payer.toLowerCase(), dayStart);
      const dailyAtomic = rows.reduce((s, r) => s + (Number(r.amount_atomic) || 0), 0);
      if (budgetAtomic != null && dailyAtomic + amt > Number(budgetAtomic)) {
        return { ok: false, code: 'budget_exceeded', dailyAtomic, budgetAtomic: Number(budgetAtomic) };
      }
      const inserted = db.prepare(
        'INSERT OR IGNORE INTO payments (tx_hash, payer, resource, amount_atomic, chain_id, chain_name, asset, settled_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(txHash, payer.toLowerCase(), resource, String(amountAtomic), chainId, chainName, asset.toLowerCase(), now);
      if (inserted.changes === 0) return { ok: false, code: 'already_banked' }; // duplicate tx hash
      return { ok: true };
    },
    alreadyBanked(txHash) {
      return !!db.prepare('SELECT 1 FROM payments WHERE tx_hash = ?').get(txHash);
    },
    spendToday(payer, at) {
      const dayStart = dayStartUtc(at || Date.now());
      const rows = db.prepare('SELECT amount_atomic FROM payments WHERE payer = ? AND settled_at >= ?').all(payer.toLowerCase(), dayStart);
      return { count: rows.length, atomic: rows.reduce((s, r) => s + (Number(r.amount_atomic) || 0), 0) };
    },
    all() {
      return db.prepare('SELECT * FROM payments ORDER BY settled_at DESC').all();
    },
    close() { db.close(); },
  };
}

function dayStartUtc(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}