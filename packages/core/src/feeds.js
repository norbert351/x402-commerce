import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Self-serve storefront registry: a seller PUBLISHES a Binance feed as a paid resource
// (symbol + type + $U price + optional daily budget + optional payTo), and the same x402
// gate then prices THAT feed per-call. Defaults apply when a field is unset. This is the
// "turn any feed into an agent-payable endpoint" rail — the reusable storefront, not a
// fixed demo catalog.
export const FEED_TYPES = ['spot', 'ticker', 'klines'];

export function createFeeds(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      price_atomic TEXT NOT NULL,
      budget_atomic TEXT,
      pay_to TEXT,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_resource ON feeds(symbol, type);
  `);

  function resource(symbol, type) {
    const s = String(symbol).toUpperCase();
    if (type === 'spot') return `/v1/market/${s}`;
    if (type === 'ticker') return `/v1/market/${s}/ticker`;
    return `/v1/market/${s}/klines`;
  }

  return {
    resource,
    list() {
      return db.prepare('SELECT * FROM feeds ORDER BY created_at DESC').all()
        .map((f) => ({ ...f, resource: resource(f.symbol, f.type), budget_atomic: f.budget_atomic, active: !!f.active }));
    },
    // find an active feed whose resource path matches (symbol+type)
    byResource(res) {
      const rows = db.prepare('SELECT * FROM feeds WHERE active = 1').all();
      return rows.find((f) => resource(f.symbol, f.type) === res) || null;
    },
    get(id) {
      const f = db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
      return f ? { ...f, active: !!f.active } : null;
    },
    create({ symbol, type, priceAtomic, budgetAtomic, payTo, note }) {
      const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!sym || !FEED_TYPES.includes(type)) throw new Error('invalid symbol or feed type');
      if (!Number.isInteger(Number(priceAtomic)) || Number(priceAtomic) <= 0) throw new Error('priceAtomic must be a positive integer');
      const budget = budgetAtomic != null && String(budgetAtomic) !== '' ? String(Math.trunc(Number(budgetAtomic))) : null;
      if (budget != null && Number(budget) < 0) throw new Error('budgetAtomic must be >= 0');
      const pay = payTo ? String(payTo).toLowerCase() : null;
      const inserted = db.prepare(
        'INSERT OR IGNORE INTO feeds (symbol, type, price_atomic, budget_atomic, pay_to, note, active, created_at) VALUES (?,?,?,?,?,?,1,?)'
      ).run(sym, type, String(priceAtomic), budget, pay, note || '', Date.now());
      if (inserted.changes === 0) throw new Error('feed already exists for this symbol+type');
      const row = db.prepare('SELECT * FROM feeds WHERE id = ?').get(inserted.lastInsertRowid);
      return { ...row, resource: resource(sym, type), active: !!row.active };
    },
    close() { db.close(); },
  };
}