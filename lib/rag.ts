import { ChatOpenAI } from '@langchain/openai';
import { createAdminClient } from './supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';
import { withRetry } from './observability';
import {
  embedDocumentsResilient,
  embedQueryResilient,
  formatEmbeddingError,
  getEmbeddingsClient,
  getLlmProvider,
} from './embeddings';
import { getOpenAiApiKey, getOpenAiChatModel } from './openaiConfig';

export interface SearchMatch {
  id: string;
  document_id: string;
  content: string;
  metadata: {
    pageNumber?: number;
    chunkIndex: number;
  };
  similarity: number;
  document_name: string;
}

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

function ollamaChatModel(): string {
  return process.env.OLLAMA_MODEL || 'llama3.2';
}

/** Minimal Ollama chat wrapper compatible with LangChain-style .stream() used in chat route. */
class OllamaChatModel {
  constructor(
    private model: string,
    private baseUrl: string,
    private streaming: boolean
  ) {}

  async stream(messages: [string, string][]) {
    const chatMessages = messages.map(([role, content]) => ({ role, content }));
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: chatMessages,
        stream: this.streaming,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${errBody.slice(0, 300)}`);
    }

    if (!this.streaming) {
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content || '';
      return (async function* () {
        yield { content };
      })();
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Ollama chat stream has no response body.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    return (async function* () {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as { message?: { content?: string } };
            yield { content: json.message?.content || '' };
          } catch {
            // ignore malformed stream chunks
          }
        }
      }
    })();
  }

  bindTools() {
    throw new Error('Tool calling is not supported with LLM_PROVIDER=ollama.');
  }

  invoke(messages: { role: string; content: string }[]) {
    return this.stream(messages.map((m) => [m.role, m.content] as [string, string])).then(
      async (stream) => {
        let content = '';
        for await (const chunk of stream) {
          content += (chunk.content as string) || '';
        }
        return { content };
      }
    );
  }
}

export { getEmbeddingsClient } from './embeddings';

export const getLLMClient = (streaming = true) => {
  if (getLlmProvider() === 'ollama') {
    return new OllamaChatModel(ollamaChatModel(), ollamaBaseUrl(), streaming) as unknown as ChatOpenAI;
  }

  const key = getOpenAiApiKey();

  return new ChatOpenAI({
    apiKey: key,
    model: getOpenAiChatModel(),
    temperature: 0.1,
    streaming,
  });
};

/** Boost matches whose content overlaps query terms (simple reranking). */
function rerankMatches(matches: SearchMatch[], query: string): SearchMatch[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

  return [...matches].sort((a, b) => {
    const overlapA = terms.filter((t) => a.content.toLowerCase().includes(t)).length;
    const overlapB = terms.filter((t) => b.content.toLowerCase().includes(t)).length;
    const scoreA = a.similarity + overlapA * 0.05;
    const scoreB = b.similarity + overlapB * 0.05;
    return scoreB - scoreA;
  });
}

export async function embedAndStoreChunks(
  documentId: string,
  chunks: { content: string; metadata: Record<string, unknown> }[]
): Promise<void> {
  const supabaseAdmin = createAdminClient();
  const BATCH_SIZE = 50;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const contents = batch.map((c) => c.content);

    let vectors: number[][];
    try {
      vectors = await withRetry(
        () => embedDocumentsResilient(contents),
        'embed-documents',
        2
      );
    } catch (error) {
      throw new Error(formatEmbeddingError(error));
    }

    const rows = batch.map((chunk, index) => ({
      document_id: documentId,
      content: chunk.content,
      embedding: vectors[index],
      metadata: chunk.metadata,
    }));

    const { error } = await supabaseAdmin.from('document_chunks').insert(rows);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('expected') && msg.includes('dimensions')) {
        throw new Error(
          `Database embedding column size does not match the model. ` +
          `Run database/migrations/004_ollama_768_embeddings.sql when using Ollama (768 dims), ` +
          `or keep vector(1536) for OpenAI. Details: ${error.message}`
        );
      }
      throw new Error(`Failed to store document chunks in database: ${error.message}`);
    }
  }
}

export async function searchSimilarChunks(
  supabase: SupabaseClient,
  query: string,
  department: string | null,
  limit: number = 5,
  threshold: number = 0.25
): Promise<SearchMatch[]> {
  let queryVector: number[];
  try {
    queryVector = await withRetry(() => embedQueryResilient(query), 'embed-query');
  } catch (error) {
    throw new Error(formatEmbeddingError(error));
  }

  const { data: matches, error: matchError } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryVector,
    match_threshold: threshold,
    match_count: limit * 2,
    filter_department: department,
  });

  if (matchError) {
    throw new Error(`Vector search failed: ${matchError.message}`);
  }

  if (!matches || matches.length === 0) {
    return [];
  }

  const documentIds = Array.from(new Set(matches.map((m: { document_id: string }) => m.document_id)));
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, name, department')
    .in('id', documentIds);

  if (docsError) {
    throw new Error(`Failed to fetch document metadata for matches: ${docsError.message}`);
  }

  const docMap = new Map(docs.map((d: { id: string; name: string }) => [d.id, d]));

  const enriched: SearchMatch[] = matches.map(
    (match: {
      id: string;
      document_id: string;
      content: string;
      metadata: SearchMatch['metadata'];
      similarity: number;
    }) => {
      const doc = docMap.get(match.document_id);
      return {
        id: match.id,
        document_id: match.document_id,
        content: match.content,
        metadata: match.metadata,
        similarity: match.similarity,
        document_name: doc ? doc.name : 'Unknown Document',
      };
    }
  );

  return rerankMatches(enriched, query).slice(0, limit);
}

export function buildRAGPrompt(matches: SearchMatch[]): string {
  if (matches.length === 0) {
    return `You are an Enterprise Knowledge Bot. You help employees answer questions based on corporate documentation.
Currently, there are no uploaded or matching documents relevant to this query. 
Politely inform the user that you don't have access to documents matching their question, and ask them to upload relevant documents first.`;
  }

  const docContexts = matches
    .map((match, idx) => {
      const pageStr = match.metadata.pageNumber ? `Page ${match.metadata.pageNumber}` : 'N/A';
      return `[Source ${idx + 1}]
Document Name: ${match.document_name}
Page: ${pageStr}
Content:
${match.content}`;
    })
    .join('\n\n---\n\n');

  return `You are an Enterprise Knowledge Bot, a professional AI assistant. 
Your goal is to answer the user's questions truthfully and accurately using the context documents provided below.

Rules of engagement:
1. ONLY use the provided Context to answer the question. Do not rely on external knowledge, the internet, or live data. You answer from ingested company documents only — not real-time updates unless the document text says so.
2. If the Context does not contain the answer, state briefly that the uploaded documents do not contain the answer. Do not make up facts.
3. Format every answer as exactly TWO short parts when the document has the answer:
   (a) **Policy line** — one sentence quoted from the document (under 30 words), with [Source N] at the end.
   (b) **Plain English** — one simple sentence explaining what that means for the employee (under 30 words). No jargon repetition.
   Example:
   Policy: "Hotels are reimbursed at the GSA per-diem rate for the city [Source 1]."
   Plain English: "For work travel, the company pays your hotel bill up to the U.S. government's maximum daily rate for that city."
4. Do NOT add headers, bullet lists, or extra paragraphs for simple one-fact questions.
5. Answer only what was asked. Do not mix in unrelated policies or documents.
6. Ground all statements strictly in the Context. Do not make up limits or numbers not in the text.

Context:
${docContexts}`;
}
