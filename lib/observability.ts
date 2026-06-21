const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

export function initObservability(): void {
  if (process.env.LANGCHAIN_TRACING_V2 === 'true' && process.env.LANGCHAIN_API_KEY) {
    process.env.LANGCHAIN_PROJECT =
      process.env.LANGCHAIN_PROJECT || 'enterprise-knowledge-bot';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[retry] ${label} attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function logRetrievalEvent(
  adminClient: ReturnType<typeof import('./supabase-server').createAdminClient>,
  payload: {
    userId: string;
    sessionId?: string;
    question: string;
    department: string;
    toolsUsed: string[];
    documentIds: string[];
    topSimilarity: number;
    confidence: string;
    matchCount: number;
  }
): Promise<void> {
  await adminClient.from('retrieval_logs').insert({
    user_id: payload.userId,
    session_id: payload.sessionId || null,
    question: payload.question,
    department: payload.department,
    tools_used: payload.toolsUsed,
    document_ids: payload.documentIds,
    top_similarity: payload.topSimilarity,
    confidence: payload.confidence,
    match_count: payload.matchCount,
  });
}

export async function writeAuditLog(
  adminClient: ReturnType<typeof import('./supabase-server').createAdminClient>,
  payload: {
    userId: string;
    action: string;
    details: Record<string, unknown>;
    ipAddress?: string;
  }
): Promise<void> {
  await adminClient.from('audit_logs').insert({
    user_id: payload.userId,
    action: payload.action,
    details: payload.details,
    ip_address: payload.ipAddress || null,
  });
}
