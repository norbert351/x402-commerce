import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

// Persist the set of consumed on-chain transaction hashes so a payment can't be
// replayed across restarts (one transfer = one paid request).
export function createConsumeRing(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = `${dir}/consumed.json`;
  let set = new Set();
  if (existsSync(file)) {
    try { set = new Set(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* ignore corrupt */ }
  }
  return (txHash) => {
    if (set.has(txHash)) return false;
    set.add(txHash);
    try { writeFileSync(file, JSON.stringify([...set])); } catch { /* non-fatal */ }
    return true;
  };
}