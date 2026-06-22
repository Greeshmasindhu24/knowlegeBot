import { normalizeEnvValue } from './openaiConfig';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function getGeminiApiKey(): string {
  const key = normalizeEnvValue(process.env.GEMINI_API_KEY);
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is required when LLM_PROVIDER=gemini. Get a free key at https://aistudio.google.com/apikey'
    );
  }
  return key;
}

export function getGeminiChatModel(): string {
  return normalizeEnvValue(process.env.GEMINI_MODEL) || 'gemini-2.0-flash';
}

export function getGeminiEmbeddingModel(): string {
  return normalizeEnvValue(process.env.GEMINI_EMBEDDING_MODEL) || 'text-embedding-004';
}

function modelPath(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`;
}

async function geminiEmbedText(text: string): Promise<number[]> {
  const apiKey = getGeminiApiKey();
  const model = modelPath(getGeminiEmbeddingModel());
  const res = await fetch(`${GEMINI_BASE}/${model}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      content: { parts: [{ text }] },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const body = (await res.json()) as { embedding?: { values?: number[] } };
  if (!Array.isArray(body.embedding?.values)) {
    throw new Error('Gemini embed returned an unexpected response shape.');
  }
  return body.embedding.values;
}

export async function geminiEmbedDocuments(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await geminiEmbedText(text));
  }
  return vectors;
}

/** Compatible with chat route LangChain-style .stream(). */
export class GeminiChatModel {
  constructor(
    private model: string,
    private apiKey: string,
    private streaming: boolean
  ) {}

  async stream(messages: [string, string][]) {
    let systemInstruction: string | undefined;
    const contents: { role: string; parts: { text: string }[] }[] = [];

    for (const [role, content] of messages) {
      if (role === 'system') {
        systemInstruction = systemInstruction ? `${systemInstruction}\n${content}` : content;
        continue;
      }
      contents.push({
        role: role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      });
    }

    const path = modelPath(this.model);
    const url = this.streaming
      ? `${GEMINI_BASE}/${path}:streamGenerateContent?key=${this.apiKey}&alt=sse`
      : `${GEMINI_BASE}/${path}:generateContent?key=${this.apiKey}`;

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.1 },
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini chat failed (${res.status}): ${errBody.slice(0, 300)}`);
    }

    if (!this.streaming) {
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const content =
        body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return (async function* () {
        yield { content };
      })();
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Gemini chat stream has no response body.');
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
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const json = JSON.parse(jsonStr) as {
              candidates?: { content?: { parts?: { text?: string }[] } }[];
            };
            const text =
              json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
            if (text) yield { content: text };
          } catch {
            // ignore malformed stream chunks
          }
        }
      }
    })();
  }

  bindTools() {
    throw new Error('Tool calling is not supported with LLM_PROVIDER=gemini.');
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

export function createGeminiChatModel(streaming = true): GeminiChatModel {
  return new GeminiChatModel(getGeminiChatModel(), getGeminiApiKey(), streaming);
}
