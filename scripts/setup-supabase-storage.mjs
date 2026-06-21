/**
 * Creates the `documents` storage bucket in Supabase (idempotent).
 *
 * Usage (from EnterpriseKnowledgeBot directory):
 *   node scripts/setup-supabase-storage.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
    // .env.local optional if vars are already exported
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'documents';
const FILE_SIZE_LIMIT = 15 * 1024 * 1024;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing, error: getError } = await supabase.storage.getBucket(BUCKET);

if (existing && !getError) {
  console.log(`Storage bucket "${BUCKET}" already exists.`);
  process.exit(0);
}

const { error: createError } = await supabase.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: FILE_SIZE_LIMIT,
});

if (createError) {
  if (/already exists|duplicate/i.test(createError.message)) {
    console.log(`Storage bucket "${BUCKET}" already exists.`);
    process.exit(0);
  }
  console.error('Failed to create bucket:', createError.message);
  console.error(
    '\nIf auto-create is blocked, run database/migrations/003_storage_documents_bucket.sql in Supabase SQL Editor.'
  );
  process.exit(1);
}

console.log(`Created storage bucket "${BUCKET}" (private, 15 MB file limit).`);
console.log(
  'Optional: run database/migrations/003_storage_documents_bucket.sql for storage RLS policies.'
);
