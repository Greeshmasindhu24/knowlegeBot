import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    /* optional */
  }
}

loadEnvLocal();

const geminiKey = process.env.GEMINI_API_KEY?.trim();
const googleKey = process.env.GOOGLE_API_KEY?.trim();

console.log('LLM_PROVIDER:', process.env.LLM_PROVIDER || '(not set)');
console.log('GEMINI_API_KEY in .env.local:', geminiKey ? `${geminiKey.slice(0, 8)}... (${geminiKey.length} chars)` : 'MISSING');
console.log('GOOGLE_API_KEY in env:', googleKey ? `${googleKey.slice(0, 8)}... (${googleKey.length} chars) — remove if different from GEMINI_API_KEY` : 'not set');

if (!geminiKey) {
  console.error('Set GEMINI_API_KEY in .env.local');
  process.exit(1);
}

const res = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
    }),
    signal: AbortSignal.timeout(30_000),
  },
);

const body = await res.text();
console.log('Gemini test status:', res.status);
console.log('Gemini test body:', body.slice(0, 400));
process.exit(res.ok ? 0 : 1);
