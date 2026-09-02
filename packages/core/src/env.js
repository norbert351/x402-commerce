import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lightweight dotenv: loads ../..env into process.env if not already present.
// Precedence: real shell env wins over the .env file.
export function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..', '.env');
  if (!existsSync(root)) return;
  for (const line of readFileSync(root, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}