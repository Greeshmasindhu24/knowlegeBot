import { OpenAIEmbeddings } from '@langchain/openai';

export type LlmProvider = 'openai' | 'ollama';

export interface EmbeddingsClient {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  provider: LlmProvider;
}

export function getLlmProvider(): LlmProvider {
  const value = (process.env.LLM_PROVIDER || 'openai').trim().toLowerCase();
  return value === 'ollama' ? 'ollama' : 'openai';
}

/** Expected vector size for pgvector (768 = Ollama nomic-embed-text, 1536 = OpenAI text-embedding-3-small). */
export function getEmbeddingDimensions(): number {
  const explicit = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (explicit) {
    const parsed = parseInt(explicit, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return getLlmProvider() === 'ollama' ? 768 : 1536;
}

export function isOllamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

function ollamaEmbeddingModel(): string {
  return process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
}

export function isOpenAiQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('billing')
  );
}

export function formatEmbeddingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (isOpenAiQuotaError(error)) {
    const ollamaHint = isOllamaConfigured()
      ? ' Or set LLM_PROVIDER=ollama in .env.local, run database/migrations/004_ollama_768_embeddings.sql, restart the dev server, and retry.'
      : ' To avoid OpenAI billing, install Ollama, run `ollama pull nomic-embed-text`, set LLM_PROVIDER=ollama in .env.local, run database/migrations/004_ollama_768_embeddings.sql, and restart.';
    return (
      'OpenAI API quota exceeded. Check billing at https://platform.openai.com/account/billing.' +
      ollamaHint
    );
  }

  if (
    lower.includes('invalid_api_key') ||
    lower.includes('incorrect api key') ||
    lower.includes('model_authentication')
  ) {
    return (
      'OpenAI API key is invalid. Update OPENAI_API_KEY in .env.local and restart the dev server.'
    );
  }

  if (lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return (
      `Cannot reach Ollama at ${ollamaBaseUrl()}. Start Ollama (ollama serve), pull the embedding model ` +
      `(ollama pull ${ollamaEmbeddingModel()}), then retry.`
    );
  }

  if (lower.includes('model') && lower.includes('not found')) {
    return (
      `Ollama embedding model "${ollamaEmbeddingModel()}" is not installed. Run: ollama pull ${ollamaEmbeddingModel()}`
    );
  }

  return message;
}

async function ollamaEmbedBatch(texts: string[]): Promise<number[][]> {
  const baseUrl = ollamaBaseUrl();
  const model = ollamaEmbeddingModel();

  const embedRes = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  });

  if (embedRes.ok) {
    const body = (await embedRes.json()) as { embeddings?: number[][] };
    if (Array.isArray(body.embeddings) && body.embeddings.length === texts.length) {
      return body.embeddings;
    }
    throw new Error('Ollama /api/embed returned an unexpected response shape.');
  }

  if (embedRes.status !== 404) {
    const errBody = await embedRes.text();
    throw new Error(`Ollama embed failed (${embedRes.status}): ${errBody.slice(0, 300)}`);
  }

  const vectors: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Ollama embeddings failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
    const body = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(body.embedding)) {
      throw new Error('Ollama /api/embeddings returned an unexpected response shape.');
    }
    vectors.push(body.embedding);
  }
  return vectors;
}

export function createOllamaEmbeddingsClient(): EmbeddingsClient {
  return {
    provider: 'ollama',
    embedDocuments: (texts) => ollamaEmbedBatch(texts),
    embedQuery: async (text) => {
      const [vector] = await ollamaEmbedBatch([text]);
      return vector;
    },
  };
}

function assertOpenAiConfigured(): void {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || !key.startsWith('sk-')) {
    throw new Error(
      'OpenAI API key is missing or invalid. Add a valid OPENAI_API_KEY (starts with sk-) to .env.local, ' +
      'or set LLM_PROVIDER=ollama for local embeddings.'
    );
  }
}

export function createOpenAiEmbeddingsClient(): EmbeddingsClient {
  assertOpenAiConfigured();
  const openai = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  });
  return {
    provider: 'openai',
    embedDocuments: (texts) => openai.embedDocuments(texts),
    embedQuery: (text) => openai.embedQuery(text),
  };
}

export function getEmbeddingsClient(): EmbeddingsClient {
  if (getLlmProvider() === 'ollama') {
    return createOllamaEmbeddingsClient();
  }
  return createOpenAiEmbeddingsClient();
}

export function assertEmbeddingDimensions(vectors: number[][]): void {
  if (vectors.length === 0) return;
  const expected = getEmbeddingDimensions();
  const actual = vectors[0]?.length ?? 0;
  if (actual !== expected) {
    throw new Error(
      `Embedding dimension mismatch: model returned ${actual} but EMBEDDING_DIMENSIONS=${expected}. ` +
      (getLlmProvider() === 'ollama'
        ? 'Run database/migrations/004_ollama_768_embeddings.sql in Supabase SQL Editor, set EMBEDDING_DIMENSIONS=768, clear old chunks, and retry upload.'
        : 'Check OPENAI_EMBEDDING_MODEL and EMBEDDING_DIMENSIONS in .env.local.')
    );
  }
}

/** OpenAI by default; on quota error falls back to Ollama when OLLAMA_BASE_URL is set. */
export async function embedDocumentsResilient(texts: string[]): Promise<number[][]> {
  if (getLlmProvider() === 'ollama') {
    const client = createOllamaEmbeddingsClient();
    const vectors = await client.embedDocuments(texts);
    assertEmbeddingDimensions(vectors);
    return vectors;
  }

  try {
    const client = createOpenAiEmbeddingsClient();
    const vectors = await client.embedDocuments(texts);
    assertEmbeddingDimensions(vectors);
    return vectors;
  } catch (error) {
    if (isOpenAiQuotaError(error) && isOllamaConfigured()) {
      console.warn('[embeddings] OpenAI quota exceeded; falling back to Ollama.');
      const vectors = await createOllamaEmbeddingsClient().embedDocuments(texts);
      assertEmbeddingDimensions(vectors);
      return vectors;
    }
    throw error;
  }
}

export async function embedQueryResilient(text: string): Promise<number[]> {
  const [vector] = await embedDocumentsResilient([text]);
  return vector;
}
