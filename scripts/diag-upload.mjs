/**
 * Diagnose upload/storage failures (read-only except a transient test row).
 * Usage: node scripts/diag-upload.mjs
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
    // optional
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
const llmProvider = (process.env.LLM_PROVIDER || 'openai').trim().toLowerCase();
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const ollamaEmbedModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const embeddingDimensions = (() => {
  const explicit = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (explicit) {
    const n = parseInt(explicit, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return llmProvider === 'ollama' ? 768 : 1536;
})();

console.log('Supabase URL set:', !!url);
console.log('Service role set:', !!key);
console.log('LLM_PROVIDER:', llmProvider);
console.log('EMBEDDING_DIMENSIONS:', embeddingDimensions);
console.log('OpenAI key starts with sk-:', openaiKey.startsWith('sk-'));
console.log('Ollama base URL:', ollamaBaseUrl);

if (!url || !key) {
  console.error('Missing Supabase env vars.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [];

async function check(name, fn) {
  try {
    const result = await fn();
    checks.push([name, result]);
  } catch (err) {
    checks.push([name, err instanceof Error ? err.message : String(err)]);
  }
}

await check('documents table', async () => {
  const { error } = await supabase.from('documents').select('id').limit(1);
  return error?.message || 'OK';
});

await check('document_chunks table', async () => {
  const { error } = await supabase.from('document_chunks').select('id').limit(1);
  return error?.message || 'OK';
});

await check('users table', async () => {
  const { error } = await supabase.from('users').select('id').limit(1);
  return error?.message || 'OK';
});

await check('documents join users', async () => {
  const { error } = await supabase.from('documents').select('*, users(email)').limit(1);
  return error?.message || 'OK';
});

await check('documents bucket', async () => {
  const { data, error } = await supabase.storage.getBucket('documents');
  if (error) return error.message;
  return data ? 'exists' : 'missing';
});

await check('match_document_chunks RPC', async () => {
  const { error } = await supabase.rpc('match_document_chunks', {
    query_embedding: Array(embeddingDimensions).fill(0),
    match_threshold: 0.5,
    match_count: 1,
    filter_department: null,
  });
  return error?.message || 'OK';
});

await check('insert test chunk', async () => {
  const { data: testDoc, error: insertDocErr } = await supabase
    .from('documents')
    .insert({
      name: '__diag_test__.txt',
      file_path: 'diag/test.txt',
      file_size: 10,
      file_type: 'txt',
      department: 'General',
      uploaded_by: null,
    })
    .select()
    .single();

  if (insertDocErr) return insertDocErr.message;

  const { error: chunkInsertErr } = await supabase.from('document_chunks').insert({
    document_id: testDoc.id,
    content: 'test chunk',
    embedding: Array(embeddingDimensions).fill(0.01),
    metadata: { chunkIndex: 0 },
  });

  await supabase.from('documents').delete().eq('id', testDoc.id);
  return chunkInsertErr?.message || 'OK';
});

if (llmProvider === 'ollama' || process.env.OLLAMA_BASE_URL) {
  await check('Ollama reachable', async () => {
    const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return `HTTP ${res.status}`;
    return 'OK';
  });

  await check('Ollama embed query', async () => {
    const res = await fetch(`${ollamaBaseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: ollamaEmbedModel,
        input: 'diagnostic test',
      }),
    });

    if (res.status === 404) {
      const legacy = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ model: ollamaEmbedModel, prompt: 'diagnostic test' }),
      });
      const legacyBody = await legacy.json();
      if (!legacy.ok) return legacyBody?.error || legacy.statusText;
      const dims = legacyBody?.embedding?.length ?? 0;
      return dims === embeddingDimensions ? `OK (${dims} dims)` : `DIM_MISMATCH: got ${dims}, expected ${embeddingDimensions}`;
    }

    const body = await res.json();
    if (!res.ok) return body?.error || res.statusText;
    const dims = body?.embeddings?.[0]?.length ?? 0;
    return dims === embeddingDimensions ? `OK (${dims} dims)` : `DIM_MISMATCH: got ${dims}, expected ${embeddingDimensions}. Run database/migrations/004_ollama_768_embeddings.sql if switching to Ollama.`;
  });
}

if (llmProvider === 'openai' && openaiKey.startsWith('sk-')) {
  await check('OpenAI embed query', async () => {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: 'diagnostic test',
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = body?.error?.message || res.statusText;
      if (res.status === 429 || body?.error?.code === 'insufficient_quota') {
        return `QUOTA: ${msg} — set LLM_PROVIDER=ollama, run migration 004, restart dev server`;
      }
      if (res.status === 401 || body?.error?.code === 'invalid_api_key') {
        return `INVALID_KEY: ${msg}`;
      }
      return msg;
    }
    return 'OK';
  });
}

for (const [name, result] of checks) {
  console.log(`${name}: ${result}`);
}
