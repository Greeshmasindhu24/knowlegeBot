/** Normalize env vars copied from .env files (quotes, spaces). */
export function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  return trimmed || undefined;
}

export function getOpenAiApiKey(): string {
  const key = normalizeEnvValue(process.env.OPENAI_API_KEY);
  if (!key || !key.startsWith('sk-')) {
    throw new Error(
      'OpenAI API key is missing or invalid. Set OPENAI_API_KEY on Render (starts with sk-).'
    );
  }
  return key;
}

export function getOpenAiChatModel(): string {
  return normalizeEnvValue(process.env.OPENAI_MODEL) || 'gpt-4o-mini';
}

export function getOpenAiEmbeddingModel(): string {
  return normalizeEnvValue(process.env.OPENAI_EMBEDDING_MODEL) || 'text-embedding-3-small';
}
