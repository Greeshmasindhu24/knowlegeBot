/**
 * Apply database/schema.sql to Supabase Postgres (idempotent CREATE IF NOT EXISTS).
 *
 * Usage (from EnterpriseKnowledgeBot directory):
 *   node scripts/setup-supabase-schema.mjs
 *
 * Requires one of:
 *   SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *   NEON_DATABASE_URL_NON_POOLING=postgresql+asyncpg://...
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function normalizeDbUrl(raw) {
  if (!raw) return null;
  let url = raw.trim();
  url = url.replace(/^postgresql\+asyncpg:\/\//, 'postgresql://');
  // Supabase direct connections use db.<project-ref>.supabase.co
  url = url.replace(
    /@([a-z0-9]+)\.supabase\.co/i,
    (_, ref) => `@db.${ref}.supabase.co`
  );
  if (!url.includes('sslmode=')) {
    url += url.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }
  return url;
}

loadEnvLocal();

const dbUrl = normalizeDbUrl(
  process.env.SUPABASE_DB_URL ||
    process.env.NEON_DATABASE_URL_NON_POOLING ||
    process.env.DATABASE_URL
);

if (!dbUrl || dbUrl.includes('localhost')) {
  console.error(
    'Missing remote Supabase DB URL. Set SUPABASE_DB_URL in .env.local ' +
      '(Supabase Dashboard → Project Settings → Database → Connection string → URI).'
  );
  process.exit(1);
}

const schemaPath = resolve(root, 'database', 'schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
});

console.log('Connecting to Supabase Postgres...');

try {
  await client.connect();
  console.log('Applying database/schema.sql...');
  await client.query(sql);
  console.log('Schema applied successfully.');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Schema apply failed:', message);
  console.error(
    '\nRun database/schema.sql manually in Supabase Dashboard → SQL Editor if connection fails.'
  );
  process.exit(1);
} finally {
  await client.end();
}
