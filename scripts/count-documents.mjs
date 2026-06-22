import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { count, error: countErr } = await supabase
  .from('documents')
  .select('*', { count: 'exact', head: true });

console.log('Total documents in Supabase:', count ?? 0, countErr ? countErr.message : '');

const { data, error } = await supabase
  .from('documents')
  .select('name, department, created_at, uploaded_by')
  .order('created_at', { ascending: false })
  .limit(20);

if (error) {
  console.error('List error:', error.message);
} else if (!data?.length) {
  console.log('No documents found in database.');
} else {
  console.log('Recent documents:');
  for (const doc of data) {
    console.log(`  - ${doc.name} | ${doc.department} | ${doc.created_at}`);
  }
}
