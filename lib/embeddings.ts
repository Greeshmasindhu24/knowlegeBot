import { OpenAIEmbeddings } from '@langchain/openai';
import { geminiEmbedDocuments } from './geminiClient';
import { getOpenAiApiKey, getOpenAiEmbeddingModel, normalizeEnvValue } from './openaiConfig';

export type LlmProvider = 'openai' | 'ollama' | 'gemini';

function isCloudDeployment(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

export function getLlmProvider(): LlmProvider {
  const configured = (process.env.LLM_PROVIDER || 'openai').trim().toLowerCase() as LlmProvider;
  const geminiKey = normalizeEnvValue(process.env.GEMINI_API_KEY);
  const openaiKey = normalizeEnvValue(process.env.OPENAI_API_KEY);

  // Ollama only runs locally — on Render use OpenAI or Gemini.
  if (isCloudDeployment()) {
    if (configured === 'openai') return 'openai';
    if (configured === 'gemini') {
      if (!geminiKey) {
        throw new Error(
          'LLM_PROVIDER=gemini but GEMINI_API_KEY is missing on Render. Add it in Environment and redeploy.'
        );
      }
      return 'gemini';
    }
    if (openaiKey) return 'openai';
    if (geminiKey) return 'gemini';
    return 'openai';
  }

  if (configured === 'ollama') return 'ollama';
  if (configured === 'gemini') return 'gemini';
  return 'openai';
}

export interface EmbeddingsClient {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  provider: LlmProvider;
}

/** Expected vector size for pgvector (768 = Ollama/Gemini, 1536 = OpenAI). */
export function getEmbeddingDimensions(): number {
  const explicit = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (explicit) {
    const parsed = parseInt(explicit, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const provider = getLlmProvider();
  return provider === 'ollama' || provider === 'gemini' ? 768 : 1536;
}

export function isOllamaConfigured(): boolean {
  const url = process.env.OLLAMA_BASE_URL?.trim();
  if (!url) return false;
  // Never use Ollama on Render — it only runs on your local machine.
  if (process.env.RENDER) return false;
  return true;
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
    return (
      'OpenAI API quota exceeded. For a free option on Render, set LLM_PROVIDER=gemini, add GEMINI_API_KEY ' +
      '(https://aistudio.google.com/apikey), EMBEDDING_DIMENSIONS=768, run database/migrations/004_ollama_768_embeddings.sql in Supabase, and re-upload documents.'
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
    if (isCloudDeployment() || getLlmProvider() === 'gemini') {
      return (
        'Cannot reach the embedding API on Render. Set GEMINI_API_KEY, LLM_PROVIDER=gemini, ' +
        'EMBEDDING_DIMENSIONS=768, remove OLLAMA_* vars, redeploy, and re-upload documents.'
      );
    }
    return (
      `Cannot reach Ollama at ${ollamaBaseUrl()}. Start Ollama (ollama serve), pull the embedding model ` +
      `(ollama pull ${ollamaEmbeddingModel()}), then retry.`
    );
  }

  if (lower.includes('model') && lower.includes('not found')) {
    if (isCloudDeployment() || getLlmProvider() !== 'ollama') {
      return (
        `${message} ` +
        'On Render, use Gemini embeddings with GEMINI_EMBEDDING_MODEL=gemini-embedding-001, ' +
        'LLM_PROVIDER=gemini, GEMINI_API_KEY, EMBEDDING_DIMENSIONS=768; remove OLLAMA_BASE_URL, redeploy, and re-upload documents.'
      );
    }
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
  getOpenAiApiKey();
}

export function createGeminiEmbeddingsClient(): EmbeddingsClient {
  return {
    provider: 'gemini',
    embedDocuments: geminiEmbedDocuments,
    embedQuery: async (text) => {
      const [vector] = await geminiEmbedDocuments([text]);
      return vector;
    },
  };
}

export function createOpenAiEmbeddingsClient(): EmbeddingsClient {
  assertOpenAiConfigured();
  const openai = new OpenAIEmbeddings({
    apiKey: getOpenAiApiKey(),
    model: getOpenAiEmbeddingModel(),
  });
  return {
    provider: 'openai',
    embedDocuments: (texts) => openai.embedDocuments(texts),
    embedQuery: (text) => openai.embedQuery(text),
  };
}

export function getEmbeddingsClient(): EmbeddingsClient {
  const provider = getLlmProvider();
  if (provider === 'ollama') return createOllamaEmbeddingsClient();
  if (provider === 'gemini') return createGeminiEmbeddingsClient();
  return createOpenAiEmbeddingsClient();
}

export function assertEmbeddingDimensions(vectors: number[][]): void {
  if (vectors.length === 0) return;
  const expected = getEmbeddingDimensions();
  const actual = vectors[0]?.length ?? 0;
  if (actual !== expected) {
    throw new Error(
      `Embedding dimension mismatch: model returned ${actual} but EMBEDDING_DIMENSIONS=${expected}. ` +
      (getLlmProvider() === 'ollama' || getLlmProvider() === 'gemini'
        ? 'Run database/migrations/004_ollama_768_embeddings.sql in Supabase SQL Editor, set EMBEDDING_DIMENSIONS=768, clear old chunks, and retry upload.'
        : 'Check OPENAI_EMBEDDING_MODEL and EMBEDDING_DIMENSIONS in .env.local.')
    );
  }
}

export async function embedDocumentsResilient(texts: string[]): Promise<number[][]> {
  const provider = getLlmProvider();
  if (provider === 'ollama') {
    const client = createOllamaEmbeddingsClient();
    const vectors = await client.embedDocuments(texts);
    assertEmbeddingDimensions(vectors);
    return vectors;
  }
  if (provider === 'gemini') {
    const client = createGeminiEmbeddingsClient();
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
