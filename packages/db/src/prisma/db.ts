import 'temporal-polyfill/global';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

// Load `.env` from cwd (default) + `packages/db/.env` resolved from this file,
// so `import { client } from '@eve_health/db'` works from any workspace cwd.
loadEnv();
try {
  const dbEnvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  loadEnv({ path: dbEnvPath });
} catch {
  // ignore - cwd `.env` already loaded
}

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});

// Alias so consumers can use either `db` or `client`
export const client = db;
